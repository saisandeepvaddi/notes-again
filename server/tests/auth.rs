mod common;

use common::jwt::{Signer, unix_now};
use common::*;
use notes_again_server::auth::external::FIREBASE_JWKS;
use notes_again_server::config::AuthMode;
use serde_json::Value;

const PROJECT: &str = "notes-test";
const KID: &str = "test-key";
const SESSION_COOKIE: &str = "notes_again_session";
const MAX_FAILED_LOGINS: usize = 5;

struct Firebase {
    app: TestApp,
    signer: Signer,
}

impl Firebase {
    async fn start(allowed: &[&str]) -> Firebase {
        let allowed: Vec<String> = allowed.iter().map(|e| e.to_string()).collect();
        let app = TestApp::with(|c| {
            c.auth_mode = AuthMode::Firebase;
            c.firebase_project_id = Some(PROJECT.into());
            c.allowed_emails = allowed.into_iter().collect();
        })
        .await;
        let signer = Signer::new(KID);
        app.state
            .jwks
            .insert(FIREBASE_JWKS, signer.jwks.clone())
            .await;
        Firebase { app, signer }
    }

    async fn restart(self, allowed: &[&str]) -> Firebase {
        let allowed: Vec<String> = allowed.iter().map(|e| e.to_string()).collect();
        let app = self
            .app
            .restart(|c| c.allowed_emails = allowed.into_iter().collect())
            .await;
        app.state
            .jwks
            .insert(FIREBASE_JWKS, self.signer.jwks.clone())
            .await;
        Firebase {
            app,
            signer: self.signer,
        }
    }

    fn claims(&self, email: &str) -> Value {
        let now = unix_now();
        json!({
            "aud": PROJECT,
            "iss": format!("https://securetoken.google.com/{PROJECT}"),
            "sub": format!("uid-{email}"),
            "user_id": format!("uid-{email}"),
            "email": email,
            "iat": now,
            "exp": now + 300,
        })
    }

    fn session(&self, email: &str) -> String {
        self.signer.sign(KID, self.claims(email))
    }

    fn me(&self) -> String {
        self.session("me@x.dev")
    }

    async fn mint(&self, body: Value) -> Value {
        self.app
            .post("/api/tokens/create")
            .bearer(&self.me())
            .json(body)
            .send()
            .await
            .ok()
    }

    async fn code(&self, path: &str, token: &str) -> u16 {
        self.app.get(path).bearer(token).send().await.code()
    }
}

#[tokio::test]
async fn requests_without_credentials_are_rejected() {
    let fb = Firebase::start(&[]).await;
    assert_eq!(fb.app.get("/api/projects/list").send().await.code(), 401);
    assert_eq!(fb.app.get("/api/tokens/list").send().await.code(), 401);
}

#[tokio::test]
async fn firebase_sessions_work_and_bad_ones_do_not() {
    let fb = Firebase::start(&[]).await;
    assert_eq!(fb.code("/api/projects/list", &fb.me()).await, 200);
    assert_eq!(fb.code("/api/projects/list", "garbage").await, 401);
}

#[tokio::test]
async fn firebase_rejects_tokens_with_the_wrong_audience_issuer_key_or_expiry() {
    let fb = Firebase::start(&[]).await;
    let mut cases = vec![];
    for (field, value) in [
        ("aud", json!("someone-else")),
        ("iss", json!("https://securetoken.google.com/other")),
        ("exp", json!(1_577_836_800)),
        ("sub", json!("")),
    ] {
        let mut claims = fb.claims("me@x.dev");
        claims[field] = value;
        cases.push((field.to_string(), fb.signer.sign(KID, claims)));
    }
    let other = Signer::new(KID);
    cases.push(("key".into(), other.sign(KID, fb.claims("me@x.dev"))));
    for (case, token) in cases {
        assert_eq!(fb.code("/api/projects/list", &token).await, 401, "{case}");
    }
}

#[tokio::test]
async fn firebase_status_reports_the_session_and_web_config() {
    let app = TestApp::with(|c| {
        c.auth_mode = AuthMode::Firebase;
        c.firebase_project_id = Some(PROJECT.into());
        c.firebase_web = Some(notes_again_server::config::FirebaseWebConfig {
            api_key: "key".into(),
            auth_domain: "x.firebaseapp.com".into(),
            project_id: "x".into(),
        });
    })
    .await;
    let status = app.get("/api/auth/status").send().await.ok();
    assert_eq!(status["mode"], "firebase");
    assert_eq!(
        status["firebase"],
        json!({ "apiKey": "key", "authDomain": "x.firebaseapp.com", "projectId": "x" })
    );
}

#[tokio::test]
async fn create_returns_the_plaintext_once_and_only_a_hash_is_stored() {
    let fb = Firebase::start(&[]).await;
    let created = fb.mint(json!({ "name": "Laptop" })).await;
    let token = created["token"].as_str().unwrap();
    assert!(token.starts_with("nal_"));
    assert_eq!(created["prefix"], &token[..10]);
    assert_eq!(created["scope"], "capture");
    let listed = fb
        .app
        .get("/api/tokens/list")
        .bearer(&fb.me())
        .send()
        .await
        .ok();
    assert_eq!(names(&listed), ["Laptop"]);
    assert!(listed[0].get("token").is_none());
    assert!(!listed.to_string().contains(token));
    let stored = fb
        .app
        .scalar_opt_str("SELECT token_hash FROM api_tokens")
        .await
        .unwrap();
    assert_eq!(stored, notes_again_server::auth::secrets::sha256_hex(token));
}

#[tokio::test]
async fn token_name_is_required_and_scope_must_be_known() {
    let fb = Firebase::start(&[]).await;
    for (body, code) in [
        (json!({ "name": "   " }), 400),
        (json!({ "name": "x", "scope": "root" }), 422),
    ] {
        let response = fb
            .app
            .post("/api/tokens/create")
            .bearer(&fb.me())
            .json(body)
            .send()
            .await;
        assert_eq!(response.code(), code);
    }
}

#[tokio::test]
async fn capture_token_can_save_a_note_end_to_end() {
    let fb = Firebase::start(&[]).await;
    let token = fb.mint(json!({ "name": "Extension" })).await["token"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(fb.code("/api/projects/list", &token).await, 200);
    assert_eq!(fb.code("/api/tags/list", &token).await, 200);
    let post = |path: &'static str, body: Value| {
        let app = &fb.app;
        let token = token.clone();
        async move { app.post(path).bearer(&token).json(body).send().await }
    };
    let project = post("/api/projects/create", json!({ "name": "Reading" }))
        .await
        .ok();
    let tag = post("/api/tags/create", json!({ "name": "rust" }))
        .await
        .ok();
    let note = post(
        "/api/notes/create",
        json!({ "name": "A post", "content": "https://a.dev\n\nbody", "project_id": id(&project), "tag_ids": [id(&tag)] }),
    )
    .await
    .ok();
    assert_eq!(note["project"]["name"], "Reading");
    assert_eq!(
        fb.code(&format!("/api/notes/{}", id(&note)), &fb.me())
            .await,
        200
    );
}

#[tokio::test]
async fn capture_token_cannot_go_beyond_capturing() {
    let fb = Firebase::start(&[]).await;
    let token = fb.mint(json!({ "name": "Extension" })).await["token"]
        .as_str()
        .unwrap()
        .to_string();
    use axum::http::Method;
    for (method, path) in [
        (Method::GET, "/api/notes/list"),
        (Method::GET, "/api/notes/1"),
        (Method::DELETE, "/api/notes/1"),
        (Method::DELETE, "/api/notes/trash"),
        (Method::PATCH, "/api/notes/1"),
        (Method::GET, "/api/settings"),
        (Method::POST, "/api/import/notes"),
        (Method::DELETE, "/api/projects/1"),
        (Method::DELETE, "/api/tags/1"),
        (Method::GET, "/api/search?q=abc"),
        (Method::GET, "/api/notes/1/markdown"),
        (Method::GET, "/api/sync/pull"),
        (Method::POST, "/api/notes/1/discuss"),
    ] {
        let response = fb.app.req(method.clone(), path).bearer(&token).send().await;
        assert_eq!(response.code(), 403, "{method} {path}");
    }
}

#[tokio::test]
async fn a_token_cannot_manage_tokens() {
    let fb = Firebase::start(&[]).await;
    for scope in ["capture", "app"] {
        let created = fb.mint(json!({ "name": scope, "scope": scope })).await;
        let token = created["token"].as_str().unwrap();
        let list = fb.app.get("/api/tokens/list").bearer(token).send().await;
        assert_eq!(list.code(), 403);
        let create = fb
            .app
            .post("/api/tokens/create")
            .bearer(token)
            .json(json!({ "name": "x" }))
            .send()
            .await;
        assert_eq!(create.code(), 403);
        let revoke = fb
            .app
            .delete(&format!("/api/tokens/{}", id(&created)))
            .bearer(token)
            .send()
            .await;
        assert_eq!(revoke.code(), 403);
    }
}

#[tokio::test]
async fn unknown_revoked_and_expired_tokens_are_rejected() {
    let fb = Firebase::start(&[]).await;
    let fake = format!("nal_{}", "x".repeat(43));
    assert_eq!(fb.code("/api/projects/list", &fake).await, 401);

    let created = fb.mint(json!({ "name": "Ext" })).await;
    let token = created["token"].as_str().unwrap();
    assert_eq!(fb.code("/api/projects/list", token).await, 200);
    let path = format!("/api/tokens/{}", id(&created));
    assert_eq!(
        fb.app.delete(&path).bearer(&fb.me()).send().await.code(),
        204
    );
    assert_eq!(fb.code("/api/projects/list", token).await, 401);
    let listed = fb
        .app
        .get("/api/tokens/list")
        .bearer(&fb.me())
        .send()
        .await
        .ok();
    assert_eq!(listed, json!([]));
    assert_eq!(
        fb.app.delete(&path).bearer(&fb.me()).send().await.code(),
        404
    );

    let expiring = fb
        .mint(json!({ "name": "Soon", "expires_in_days": 30 }))
        .await;
    let token = expiring["token"].as_str().unwrap();
    assert_eq!(fb.code("/api/projects/list", token).await, 200);
    fb.app
        .exec(&format!(
            "UPDATE api_tokens SET expires_at = '2020-01-01 00:00:00.000000' WHERE id = {}",
            id(&expiring)
        ))
        .await;
    assert_eq!(fb.code("/api/projects/list", token).await, 401);
}

#[tokio::test]
async fn last_used_is_recorded() {
    let fb = Firebase::start(&[]).await;
    let created = fb.mint(json!({ "name": "Ext" })).await;
    let list = || async {
        fb.app
            .get("/api/tokens/list")
            .bearer(&fb.me())
            .send()
            .await
            .ok()
    };
    assert!(list().await[0]["last_used_at"].is_null());
    fb.code("/api/projects/list", created["token"].as_str().unwrap())
        .await;
    assert!(!list().await[0]["last_used_at"].is_null());
}

#[tokio::test]
async fn allowlist_blocks_other_accounts_case_insensitively() {
    let fb = Firebase::start(&["me@x.dev", "someone@else.dev"]).await;
    let mixed_case = fb.session("Me@X.dev");
    assert_eq!(fb.code("/api/projects/list", &mixed_case).await, 200);
    let stranger = fb.session("stranger@x.dev");
    assert_eq!(fb.code("/api/projects/list", &stranger).await, 403);
}

#[tokio::test]
async fn allowlist_unset_changes_nothing() {
    let fb = Firebase::start(&[]).await;
    let stranger = fb.session("stranger@x.dev");
    assert_eq!(fb.code("/api/projects/list", &stranger).await, 200);
}

#[tokio::test]
async fn removing_someone_from_the_allowlist_also_kills_their_tokens() {
    let fb = Firebase::start(&["me@x.dev"]).await;
    let token = fb.mint(json!({ "name": "Ext" })).await["token"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(fb.code("/api/projects/list", &token).await, 200);
    let fb = fb.restart(&["someone@else.dev"]).await;
    assert_eq!(fb.code("/api/projects/list", &token).await, 401);
}

#[tokio::test]
async fn auth_mode_none_means_open() {
    let app = TestApp::new().await;
    assert_eq!(app.get("/api/projects/list").send().await.code(), 200);
    assert_eq!(app.get("/api/tokens/list").send().await.code(), 200);
}

#[tokio::test]
async fn app_token_can_do_everything_but_manage_tokens_and_system() {
    let fb = Firebase::start(&[]).await;
    let created = fb.mint(json!({ "name": "Phone", "scope": "app" })).await;
    assert_eq!(created["scope"], "app");
    let token = created["token"].as_str().unwrap();
    let note = fb
        .app
        .post("/api/notes/create")
        .bearer(token)
        .json(json!({ "name": "n", "content": "c" }))
        .send()
        .await
        .ok();
    let path = format!("/api/notes/{}", id(&note));
    for path in [
        "/api/notes/due",
        path.as_str(),
        "/api/settings",
        "/api/search?q=abc",
        &format!("{path}/markdown"),
        "/api/sync/pull",
    ] {
        assert_eq!(fb.code(path, token).await, 200, "{path}");
    }
    let updated = fb
        .app
        .patch(&path)
        .bearer(token)
        .json(json!({ "name": "m", "content": "d" }))
        .send()
        .await;
    assert_eq!(updated.code(), 200);
    assert_eq!(fb.app.delete(&path).bearer(token).send().await.code(), 204);
    assert_eq!(fb.code("/api/tokens/list", token).await, 403);
    assert_eq!(fb.code("/api/system", token).await, 403);
}

async fn local() -> TestApp {
    TestApp::with(|c| c.auth_mode = AuthMode::Local).await
}

async fn initial_password(app: &TestApp) -> String {
    app.scalar_opt_str("SELECT initial_password FROM local_auth WHERE id = 1")
        .await
        .expect("an initial password")
}

async fn login(app: &TestApp, username: &str, password: &str) -> u16 {
    app.post("/api/auth/login")
        .json(json!({ "username": username, "password": password }))
        .send()
        .await
        .code()
}

async fn login_initial(app: &TestApp) -> u16 {
    let password = initial_password(app).await;
    login(app, "admin", &password).await
}

async fn put_local(app: &TestApp, body: Value) -> u16 {
    app.put("/api/auth/local").json(body).send().await.code()
}

async fn status(app: &TestApp) -> Value {
    app.get("/api/auth/status").send().await.ok()
}

async fn projects(app: &TestApp) -> u16 {
    app.get("/api/projects/list").send().await.code()
}

#[test]
fn password_hashes_verify_and_reject() {
    use notes_again_server::auth::secrets::{hash_password, verify_password};
    let stored = hash_password("correct horse");
    assert!(verify_password("correct horse", &stored));
    assert!(!verify_password("wrong horse", &stored));
    assert!(!verify_password("anything", "not-a-hash"));
}

#[tokio::test]
async fn first_launch_requires_sign_in_with_the_generated_password() {
    let app = local().await;
    let first = status(&app).await;
    assert_eq!(first["mode"], "local");
    assert_eq!(first["authenticated"], false);
    assert_eq!(first["setup_required"], true);
    assert_eq!(projects(&app).await, 401);
    assert_eq!(login(&app, "admin", "admin").await, 401);
    assert_eq!(login_initial(&app).await, 204);
    assert!(app.cookie(SESSION_COOKIE).is_some());
    let signed_in = status(&app).await;
    assert_eq!(signed_in["authenticated"], true);
    assert_eq!(signed_in["username"], "admin");
    assert_eq!(projects(&app).await, 200);
}

#[tokio::test]
async fn setup_replaces_the_default_credentials() {
    let app = local().await;
    let old = initial_password(&app).await;
    login_initial(&app).await;
    let body = json!({ "enabled": true, "username": "sai", "password": "a much better one" });
    assert_eq!(put_local(&app, body).await, 204);
    let after = status(&app).await;
    assert_eq!(after["setup_required"], false);
    assert_eq!(after["username"], "sai");
    assert!(
        app.scalar_opt_str("SELECT initial_password FROM local_auth WHERE id = 1")
            .await
            .is_none()
    );
    app.post("/api/auth/logout").send().await;
    assert_eq!(projects(&app).await, 401);
    assert_eq!(login(&app, "admin", &old).await, 401);
    assert_eq!(login(&app, "sai", "a much better one").await, 204);
}

#[tokio::test]
async fn setup_rejects_short_passwords_and_needs_a_session() {
    let app = local().await;
    let body = json!({ "enabled": true, "username": "x", "password": "long enough" });
    assert_eq!(put_local(&app, body).await, 401);
    login_initial(&app).await;
    let short = json!({ "enabled": true, "username": "sai", "password": "short" });
    assert_eq!(put_local(&app, short).await, 400);
}

#[tokio::test]
async fn later_changes_need_the_current_password() {
    let app = local().await;
    login_initial(&app).await;
    put_local(
        &app,
        json!({ "enabled": true, "username": "sai", "password": "first password" }),
    )
    .await;
    let mut body = json!({ "enabled": true, "username": "sai", "password": "second password" });
    assert_eq!(put_local(&app, body.clone()).await, 403);
    body["current_password"] = json!("first password");
    assert_eq!(put_local(&app, body).await, 204);
}

#[tokio::test]
async fn turning_login_off_opens_the_app_and_can_be_turned_back_on() {
    let app = local().await;
    login_initial(&app).await;
    assert_eq!(put_local(&app, json!({ "enabled": false })).await, 204);
    app.clear_cookies();
    let open = status(&app).await;
    assert_eq!(open["mode"], "none");
    assert_eq!(open["configured_mode"], "local");
    assert_eq!(projects(&app).await, 200);
    let body = json!({ "enabled": true, "username": "sai", "password": "back on again" });
    assert_eq!(put_local(&app, body).await, 204);
    app.clear_cookies();
    assert_eq!(projects(&app).await, 401);
}

#[tokio::test]
async fn repeated_failures_are_throttled() {
    let app = local().await;
    for _ in 0..MAX_FAILED_LOGINS {
        assert_eq!(login(&app, "admin", "nope nope").await, 401);
    }
    assert_eq!(login_initial(&app).await, 429);
}

#[tokio::test]
async fn api_tokens_work_in_local_mode() {
    let app = local().await;
    login_initial(&app).await;
    let created = app
        .post("/api/tokens/create")
        .json(json!({ "name": "Extension" }))
        .send()
        .await
        .ok();
    app.clear_cookies();
    let token = created["token"].as_str().unwrap();
    let list = app.get("/api/projects/list").bearer(token).send().await;
    assert_eq!(list.code(), 200);
    let tokens = app.get("/api/tokens/list").bearer(token).send().await;
    assert_eq!(tokens.code(), 403);
}

#[tokio::test]
async fn forged_session_cookie_is_rejected() {
    let app = local().await;
    app.set_cookie(SESSION_COOKIE, "made-up");
    assert_eq!(projects(&app).await, 401);
}

#[tokio::test]
async fn admin_password_setting_skips_first_launch_setup() {
    let app = TestApp::with(|c| {
        c.auth_mode = AuthMode::Local;
        c.admin_username = "owner".into();
        c.admin_password = "from the environment".into();
    })
    .await;
    assert_eq!(status(&app).await["setup_required"], false);
    assert_eq!(login(&app, "owner", "from the environment").await, 204);
}

#[tokio::test]
async fn login_and_token_sign_in_are_refused_outside_local_mode() {
    let app = TestApp::new().await;
    assert_eq!(login(&app, "a", "b").await, 409);
    let token = app
        .post("/api/auth/token")
        .json(json!({ "username": "a", "password": "b" }))
        .send()
        .await;
    assert_eq!(token.code(), 409);
    assert_eq!(status(&app).await["mode"], "none");
}

async fn token_login(app: &TestApp, password: &str, device: Option<&str>) -> Res {
    let mut body = json!({ "username": "admin", "password": password });
    if let Some(device) = device {
        body["device_name"] = json!(device);
    }
    app.post("/api/auth/token").json(body).send().await
}

#[tokio::test]
async fn signing_in_for_a_token_gives_an_app_token() {
    let app = local().await;
    let password = initial_password(&app).await;
    let created = token_login(&app, &password, Some("Pixel")).await.ok();
    assert_eq!(created["scope"], "app");
    assert_eq!(created["name"], "Pixel");
    assert!(app.cookie(SESSION_COOKIE).is_none());
    let token = created["token"].as_str().unwrap();
    assert_eq!(
        app.get("/api/notes/due").bearer(token).send().await.code(),
        200
    );
    assert_eq!(
        app.get("/api/tokens/list")
            .bearer(token)
            .send()
            .await
            .code(),
        403
    );
    login_initial(&app).await;
    let listed = app.get("/api/tokens/list").send().await.ok();
    assert_eq!(names(&listed), ["Pixel"]);
}

#[tokio::test]
async fn token_sign_in_rejects_wrong_passwords_and_is_throttled() {
    let app = local().await;
    for _ in 0..MAX_FAILED_LOGINS {
        assert_eq!(token_login(&app, "nope nope", None).await.code(), 401);
    }
    let password = initial_password(&app).await;
    assert_eq!(token_login(&app, &password, None).await.code(), 429);
}

#[tokio::test]
async fn an_app_can_revoke_its_own_token() {
    let app = local().await;
    let password = initial_password(&app).await;
    let created = token_login(&app, &password, None).await.ok();
    let token = created["token"].as_str().unwrap();
    let revoke = || app.delete("/api/auth/token").bearer(token).send();
    assert_eq!(revoke().await.code(), 204);
    assert_eq!(
        app.get("/api/notes/due").bearer(token).send().await.code(),
        401
    );
    assert_eq!(revoke().await.code(), 401);
    assert_eq!(app.delete("/api/auth/token").send().await.code(), 401);
}
