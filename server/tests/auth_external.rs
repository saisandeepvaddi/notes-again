mod common;

use common::jwt::{Signer, unix_now};
use common::*;
use notes_again_server::config::AuthMode;
use serde_json::Value;

const KID: &str = "cf-key";
const TEAM: &str = "myteam.cloudflareaccess.com";
const AUD: &str = "aud-123";
const SECRET: &str = "launch-secret";

async fn proxy(configure: impl FnOnce(&mut notes_again_server::config::Config)) -> TestApp {
    TestApp::with(|c| {
        c.auth_mode = AuthMode::Proxy;
        configure(c);
    })
    .await
}

async fn projects_as(app: &TestApp, peer: &str, headers: &[(&str, &str)]) -> u16 {
    let mut request = app.get("/api/projects/list").peer(peer);
    for (name, value) in headers {
        request = request.header(name, value);
    }
    request.send().await.code()
}

#[tokio::test]
async fn proxy_header_is_trusted_only_from_a_trusted_peer() {
    let app = proxy(|_| {}).await;
    assert_eq!(projects_as(&app, "127.0.0.1", &[]).await, 401);
    let user = [("Remote-User", "sai")];
    assert_eq!(projects_as(&app, "127.0.0.1", &user).await, 200);
    assert_eq!(projects_as(&app, "::1", &user).await, 200);
    let status = app
        .get("/api/auth/status")
        .peer("127.0.0.1")
        .header("Remote-User", "sai")
        .send()
        .await
        .ok();
    assert_eq!(status["mode"], "proxy");
    assert_eq!(status["authenticated"], true);
    assert_eq!(status["username"], "sai");

    assert_eq!(projects_as(&app, "203.0.113.9", &user).await, 401);
    let outside = app
        .get("/api/auth/status")
        .peer("203.0.113.9")
        .header("Remote-User", "sai")
        .send()
        .await
        .ok();
    assert_eq!(outside["authenticated"], false);
}

#[tokio::test]
async fn forwarded_for_does_not_make_an_untrusted_peer_trusted() {
    let app = proxy(|_| {}).await;
    let headers = [("Remote-User", "sai"), ("X-Forwarded-For", "127.0.0.1")];
    assert_eq!(projects_as(&app, "203.0.113.9", &headers).await, 401);
}

#[tokio::test]
async fn proxy_honours_custom_header_networks_and_allowlist() {
    let app = proxy(|c| {
        c.trusted_proxies = vec!["10.0.0.0/8".into()];
        c.proxy_header = "Tailscale-User-Login".into();
        c.proxy_logout_url = Some("https://auth.example.com/logout".into());
        c.allowed_emails = ["me@x.dev".to_string()].into_iter().collect();
    })
    .await;
    let mine = [("Tailscale-User-Login", "me@x.dev")];
    let theirs = [("Tailscale-User-Login", "them@x.dev")];
    assert_eq!(projects_as(&app, "10.1.2.3", &mine).await, 200);
    assert_eq!(projects_as(&app, "10.1.2.3", &theirs).await, 403);
    assert_eq!(
        projects_as(&app, "10.1.2.3", &[("Remote-User", "me@x.dev")]).await,
        401
    );
    assert_eq!(projects_as(&app, "127.0.0.1", &mine).await, 401);
    let status = app
        .get("/api/auth/status")
        .peer("10.1.2.3")
        .header("Tailscale-User-Login", "me@x.dev")
        .send()
        .await
        .ok();
    assert_eq!(status["logout_url"], "https://auth.example.com/logout");
}

#[tokio::test]
async fn api_tokens_work_in_proxy_mode() {
    let app = proxy(|_| {}).await;
    let created = app
        .post("/api/tokens/create")
        .peer("127.0.0.1")
        .header("Remote-User", "sai")
        .json(json!({ "name": "Ext" }))
        .send()
        .await
        .ok();
    let token = format!("Bearer {}", created["token"].as_str().unwrap());
    assert_eq!(
        projects_as(&app, "203.0.113.9", &[("Authorization", &token)]).await,
        200
    );
}

struct Cloudflare {
    app: TestApp,
    signer: Signer,
}

impl Cloudflare {
    async fn start(allowed: &[&str]) -> Cloudflare {
        let allowed: Vec<String> = allowed.iter().map(|e| e.to_string()).collect();
        let app = TestApp::with(|c| {
            c.auth_mode = AuthMode::CloudflareAccess;
            c.cloudflare_team_domain = TEAM.into();
            c.cloudflare_audience = AUD.into();
            c.allowed_emails = allowed.into_iter().collect();
        })
        .await;
        let signer = Signer::new(KID);
        app.state
            .jwks
            .insert(
                &format!("https://{TEAM}/cdn-cgi/access/certs"),
                signer.jwks.clone(),
            )
            .await;
        Cloudflare { app, signer }
    }

    fn claims(&self) -> Value {
        let now = unix_now();
        json!({
            "aud": [AUD],
            "iss": format!("https://{TEAM}"),
            "email": "me@x.dev",
            "iat": now,
            "exp": now + 300,
        })
    }

    fn sign(&self, overrides: Value) -> String {
        let mut claims = self.claims();
        for (key, value) in overrides.as_object().unwrap() {
            claims[key] = value.clone();
        }
        self.signer.sign(KID, claims)
    }

    async fn projects(&self, assertion: &str) -> u16 {
        self.app
            .get("/api/projects/list")
            .header("Cf-Access-Jwt-Assertion", assertion)
            .send()
            .await
            .code()
    }
}

#[tokio::test]
async fn cloudflare_access_accepts_a_valid_assertion() {
    let cf = Cloudflare::start(&[]).await;
    assert_eq!(cf.app.get("/api/projects/list").send().await.code(), 401);
    let assertion = cf.sign(json!({}));
    assert_eq!(cf.projects(&assertion).await, 200);
    let status = cf
        .app
        .get("/api/auth/status")
        .header("Cf-Access-Jwt-Assertion", &assertion)
        .send()
        .await
        .ok();
    assert_eq!(status["mode"], "cloudflare-access");
    assert_eq!(status["authenticated"], true);
    assert_eq!(status["username"], "me@x.dev");
    assert_eq!(status["logout_url"], "/cdn-cgi/access/logout");
}

#[tokio::test]
async fn cloudflare_access_accepts_the_cookie() {
    let cf = Cloudflare::start(&[]).await;
    cf.app.set_cookie("CF_Authorization", &cf.sign(json!({})));
    assert_eq!(cf.app.get("/api/projects/list").send().await.code(), 200);
}

#[tokio::test]
async fn cloudflare_access_rejects_bad_assertions() {
    let cf = Cloudflare::start(&[]).await;
    for overrides in [
        json!({ "aud": ["someone-else"] }),
        json!({ "iss": "https://other.cloudflareaccess.com" }),
        json!({ "exp": 1_577_836_800 }),
    ] {
        assert_eq!(
            cf.projects(&cf.sign(overrides.clone())).await,
            401,
            "{overrides}"
        );
    }
    assert_eq!(cf.projects("not a jwt").await, 401);
}

#[tokio::test]
async fn cloudflare_access_rejects_a_token_signed_by_another_key() {
    let cf = Cloudflare::start(&[]).await;
    let forged = Signer::new(KID).sign(KID, cf.claims());
    assert_eq!(cf.projects(&forged).await, 401);
}

#[tokio::test]
async fn cloudflare_access_honours_the_allowlist() {
    let cf = Cloudflare::start(&["someone@else.dev"]).await;
    assert_eq!(cf.projects(&cf.sign(json!({}))).await, 403);
    let allowed = cf.sign(json!({ "email": "Someone@Else.dev" }));
    assert_eq!(cf.projects(&allowed).await, 200);
}

async fn desktop() -> TestApp {
    TestApp::with(|c| {
        c.auth_mode = AuthMode::Desktop;
        c.desktop_secret = Some(SECRET.into());
    })
    .await
}

#[tokio::test]
async fn desktop_mode_rejects_requests_without_the_launch_cookie() {
    let app = desktop().await;
    assert_eq!(app.get("/api/projects/list").send().await.code(), 401);
    let status = app.get("/api/auth/status").send().await.ok();
    assert_eq!(status["mode"], "desktop");
    assert_eq!(status["authenticated"], false);
}

#[tokio::test]
async fn desktop_sign_in_sets_the_cookie_and_opens_the_app() {
    let app = desktop().await;
    let response = app
        .get(&format!("/api/auth/desktop?secret={SECRET}"))
        .send()
        .await;
    assert_eq!(response.code(), 303);
    assert_eq!(response.header("location").as_deref(), Some("/"));
    assert_eq!(app.get("/api/projects/list").send().await.code(), 200);
    assert_eq!(
        app.get("/api/auth/status").send().await.ok()["authenticated"],
        true
    );
}

#[tokio::test]
async fn desktop_sign_in_rejects_a_wrong_secret() {
    let app = desktop().await;
    let response = app.get("/api/auth/desktop?secret=guess").send().await;
    assert_eq!(response.code(), 404);
    assert_eq!(app.get("/api/projects/list").send().await.code(), 401);
}

#[tokio::test]
async fn the_launch_secret_also_works_as_a_bearer_token() {
    let app = desktop().await;
    app.clear_cookies();
    let with_secret = app
        .get("/api/projects/list")
        .without_cookies()
        .bearer(SECRET)
        .send()
        .await;
    assert_eq!(with_secret.code(), 200);
    let status = app
        .get("/api/auth/status")
        .without_cookies()
        .bearer(SECRET)
        .send()
        .await
        .ok();
    assert_eq!(status["authenticated"], true);
    let wrong = app
        .get("/api/projects/list")
        .without_cookies()
        .bearer("not-the-secret")
        .send()
        .await;
    assert_eq!(wrong.code(), 401);
}

#[tokio::test]
async fn desktop_sign_in_is_unavailable_in_other_modes() {
    let app = TestApp::with(|c| c.desktop_secret = Some(SECRET.into())).await;
    let response = app
        .get(&format!("/api/auth/desktop?secret={SECRET}"))
        .send()
        .await;
    assert_eq!(response.code(), 404);
}

#[tokio::test]
async fn desktop_only_sync_routes_404_elsewhere() {
    let app = TestApp::new().await;
    assert_eq!(app.get("/api/sync/status").send().await.code(), 404);
}

#[tokio::test]
async fn start_desktop_serves_over_http_and_stops_on_shutdown() {
    let dir = tempfile::tempdir().unwrap();
    let server = notes_again_server::start_desktop(
        dir.path().join("desktop.db"),
        dir.path().join("dist"),
        SECRET.into(),
    )
    .await
    .unwrap();
    let base = format!("http://127.0.0.1:{}", server.port);
    let health = reqwest::get(format!("{base}/healthz")).await.unwrap();
    assert_eq!(health.status(), 200);
    let rejected = reqwest::get(format!("{base}/api/projects/list"))
        .await
        .unwrap();
    assert_eq!(rejected.status(), 401);
    server.shutdown.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(10), server.task)
        .await
        .unwrap()
        .unwrap();
    assert!(reqwest::get(format!("{base}/healthz")).await.is_err());
}

fn build_dist(app: &TestApp) {
    let dist = &app.state.config.frontend_dist;
    std::fs::write(dist.join("index.html"), "<!doctype html><title>app</title>").unwrap();
    std::fs::write(
        dist.join("favicon.svg"),
        "<svg xmlns='http://www.w3.org/2000/svg'/>",
    )
    .unwrap();
    std::fs::create_dir_all(dist.join("assets")).unwrap();
    std::fs::write(dist.join("assets/app.js"), "console.log(1)").unwrap();
    std::fs::write(app.path("secret.txt"), "outside the build").unwrap();
}

#[tokio::test]
async fn serves_root_level_build_files_and_caches_assets() {
    let app = TestApp::new().await;
    build_dist(&app);
    let icon = app.get("/favicon.svg").send().await;
    assert_eq!(icon.code(), 200);
    assert!(
        icon.header("content-type")
            .unwrap()
            .starts_with("image/svg+xml")
    );
    let asset = app.get("/assets/app.js").send().await;
    assert!(asset.header("cache-control").unwrap().contains("immutable"));
}

#[tokio::test]
async fn unknown_paths_fall_back_to_the_app_but_api_paths_do_not() {
    let app = TestApp::new().await;
    build_dist(&app);
    let page = app.get("/notes/42").send().await;
    assert_eq!(page.code(), 200);
    assert!(page.text().contains("<title>app</title>"));
    let api = app.get("/api/nope").send().await;
    assert_eq!(api.code(), 404);
    assert_eq!(api.json(), json!({ "message": "Not found" }));
}

#[tokio::test]
async fn does_not_serve_files_outside_the_build() {
    let app = TestApp::new().await;
    build_dist(&app);
    for path in [
        "/..%2Fsecret.txt",
        "/../secret.txt",
        "/assets/../../secret.txt",
    ] {
        let response = app.get(path).send().await;
        assert!(!response.text().contains("outside the build"), "{path}");
    }
}

#[tokio::test]
async fn with_the_web_ui_off_the_server_only_syncs() {
    let app = TestApp::with(|c| c.web_ui = false).await;
    build_dist(&app);
    let home = app.get("/").send().await;
    assert_eq!(home.code(), 200);
    assert!(home.text().contains("WEB_UI=off"));
    assert!(!home.text().contains("<title>app</title>"));
    assert_eq!(app.get("/notes/42").send().await.code(), 404);
    assert_eq!(app.get("/favicon.svg").send().await.code(), 404);
    assert_eq!(app.get("/api/projects/list").send().await.code(), 200);
    assert_eq!(app.get("/healthz").send().await.code(), 200);
}
