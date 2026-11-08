mod common;

use common::*;
use notes_again_server::config::AuthMode;
use serde_json::Value;

const SECRET: &str = "launch-secret";

async fn desktop() -> TestApp {
    let app = TestApp::with(|c| {
        c.auth_mode = AuthMode::Desktop;
        c.desktop_secret = Some(SECRET.into());
    })
    .await;
    assert_eq!(
        app.get(&format!("/api/auth/desktop?secret={SECRET}"))
            .send()
            .await
            .code(),
        303
    );
    app
}

async fn set_network(app: &TestApp, enabled: bool) -> Value {
    app.put("/api/desktop/network")
        .json(json!({ "enabled": enabled }))
        .send()
        .await
        .ok()
}

fn client() -> reqwest::Client {
    reqwest::Client::new()
}

async fn status_of(request: reqwest::RequestBuilder) -> u16 {
    request.send().await.unwrap().status().as_u16()
}

#[tokio::test]
async fn desktop_connection_settings_are_desktop_and_session_only() {
    let open = TestApp::new().await;
    assert_eq!(
        open.get("/api/desktop/connections").send().await.code(),
        404
    );

    let app = desktop().await;
    let info = app.get("/api/desktop/connections").send().await.ok();
    assert_eq!(info["network"]["enabled"], false);
    assert_eq!(info["network"]["urls"], json!([]));
    let pair = app.post("/api/desktop/network/pair").send().await;
    assert_eq!(pair.code(), 409);

    let token = app
        .post("/api/tokens/create")
        .json(json!({ "name": "Phone", "scope": "app" }))
        .send()
        .await
        .ok()["token"]
        .as_str()
        .unwrap()
        .to_string();
    for (method, path) in [
        (axum::http::Method::GET, "/api/desktop/connections"),
        (axum::http::Method::PUT, "/api/desktop/network"),
        (axum::http::Method::POST, "/api/desktop/network/pair"),
        (axum::http::Method::GET, "/api/sync/status"),
        (axum::http::Method::PUT, "/api/sync/remote"),
        (axum::http::Method::POST, "/api/sync/run"),
    ] {
        let response = app
            .req(method.clone(), path)
            .without_cookies()
            .bearer(&token)
            .json(json!({ "enabled": true, "url": "https://evil.example" }))
            .send()
            .await;
        assert_eq!(response.code(), 403, "{method} {path}");
    }
}

#[tokio::test]
async fn a_paired_phone_reaches_the_desktop_over_the_network_with_its_token_only() {
    let app = desktop().await;
    let info = set_network(&app, true).await;
    assert_eq!(info["network"]["enabled"], true);
    let port = info["network"]["port"].as_u64().unwrap();
    let base = format!("http://127.0.0.1:{port}");

    let pairing = app.post("/api/desktop/network/pair").send().await.ok();
    let token = pairing["token"].as_str().unwrap().to_string();
    assert!(token.starts_with("nal_"));
    assert!(
        pairing["server"]
            .as_str()
            .unwrap()
            .ends_with(&format!(":{port}"))
    );
    app.named("On the desktop").await;

    let http = client();
    assert_eq!(status_of(http.get(format!("{base}/healthz"))).await, 200);
    assert_eq!(
        status_of(http.get(format!("{base}/api/auth/status"))).await,
        200
    );
    assert_eq!(status_of(http.get(format!("{base}/"))).await, 404);
    assert_eq!(status_of(http.get(format!("{base}/notes"))).await, 404);

    let anonymous = http
        .get(format!("{base}/api/notes/list"))
        .send()
        .await
        .unwrap();
    assert_eq!(anonymous.status().as_u16(), 401);
    let detail: Value = anonymous.json().await.unwrap();
    assert!(detail["detail"].as_str().unwrap().contains("QR code"));

    let cookie = format!(
        "notes_again_desktop={}",
        app.cookie("notes_again_desktop").unwrap()
    );
    assert_eq!(
        status_of(
            http.get(format!("{base}/api/notes/list"))
                .header("cookie", &cookie)
        )
        .await,
        401
    );
    assert_eq!(
        status_of(
            http.get(format!("{base}/api/notes/list"))
                .bearer_auth(SECRET)
        )
        .await,
        401
    );

    let listed: Value = http
        .get(format!("{base}/api/notes/list"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(names(&listed["items"]), ["On the desktop"]);
    assert_eq!(
        status_of(
            http.get(format!("{base}/api/tokens/list"))
                .bearer_auth(&token)
        )
        .await,
        403
    );
    assert_eq!(
        status_of(http.get(format!("{base}/api/system")).bearer_auth(&token)).await,
        403
    );
    assert_eq!(
        status_of(
            http.put(format!("{base}/api/desktop/network"))
                .bearer_auth(&token)
                .json(&json!({ "enabled": false }))
        )
        .await,
        403
    );

    let info = app.get("/api/desktop/connections").send().await.ok();
    assert_eq!(info["network"]["paired_devices"], 1);

    let off = set_network(&app, false).await;
    assert_eq!(off["network"]["enabled"], false);
    assert_eq!(off["network"]["paired_devices"], 0);
    assert!(app.state.lan.lock().await.is_none());
    match http
        .get(format!("{base}/api/notes/list"))
        .bearer_auth(&token)
        .send()
        .await
    {
        Err(_) => {}
        Ok(response) => assert_eq!(response.status().as_u16(), 401),
    }
    let revoked = app
        .get("/api/notes/list")
        .without_cookies()
        .bearer(&token)
        .send()
        .await;
    assert_eq!(revoked.code(), 401);
}

#[tokio::test]
async fn phone_access_is_remembered_across_restarts() {
    let app = desktop().await;
    set_network(&app, true).await;
    let app = app.restart(|_| {}).await;
    let info = app.get("/api/desktop/connections").send().await.ok();
    assert_eq!(info["network"]["enabled"], true);
    let port = info["network"]["port"].as_u64().unwrap();
    assert_eq!(
        status_of(client().get(format!("http://127.0.0.1:{port}/healthz"))).await,
        200
    );
    set_network(&app, false).await;
}
