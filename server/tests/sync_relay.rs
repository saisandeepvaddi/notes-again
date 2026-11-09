mod common;

use common::*;
use notes_again_server::config::AuthMode;
use notes_again_server::sync::client::{Remote, SyncOutcome, sync_once};
use serde_json::Value;

const SECRET: &str = "launch-secret";

async fn desktop_app() -> TestApp {
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

async fn point_at(client: &TestApp, url: &str, token: &str) {
    sqlx::query(
        "INSERT INTO sync_remote (id, url, token, pushed_version, pulled_version, created_at) \
         VALUES (1, ?, ?, 0, 0, ?)",
    )
    .bind(url)
    .bind(token)
    .bind(notes_again_server::time::Ts::now())
    .execute(&client.state.db)
    .await
    .unwrap();
}

async fn sync(client: &TestApp) -> SyncOutcome {
    let state = &client.state;
    let _guard = state.sync_lock.lock().await;
    let (url, token, pin): (String, String, Option<String>) =
        sqlx::query_as("SELECT url, token, pinned_cert FROM sync_remote WHERE id = 1")
            .fetch_one(&state.db)
            .await
            .unwrap();
    sync_once(state, &Remote::pinned(&url, Some(&token), pin.as_deref()))
        .await
        .unwrap_or_else(|e| panic!("sync failed: {e:?}"))
}

struct Chain {
    server: TestApp,
    desktop: TestApp,
    phone: TestApp,
    _served: Vec<Served>,
}

impl Chain {
    async fn new() -> Chain {
        let server = TestApp::new().await;
        let server_http = server.serve().await;
        let desktop = desktop_app().await;
        point_at(&desktop, &server_http.url, "unused").await;
        let desktop_http = desktop.serve().await;
        let token = desktop
            .post("/api/tokens/create")
            .json(json!({ "name": "Phone", "scope": "app" }))
            .send()
            .await
            .ok()["token"]
            .as_str()
            .unwrap()
            .to_string();
        let phone = desktop_app().await;
        point_at(&phone, &desktop_http.url, &token).await;
        Chain {
            server,
            desktop,
            phone,
            _served: vec![server_http, desktop_http],
        }
    }

    async fn round(&self) -> (SyncOutcome, SyncOutcome, SyncOutcome) {
        let phone = sync(&self.phone).await;
        let desktop = sync(&self.desktop).await;
        let again = sync(&self.phone).await;
        (phone, desktop, again)
    }
}

async fn names_on(app: &TestApp) -> Vec<String> {
    let mut found = names(&app.get("/api/notes/list").send().await.ok()["items"]);
    found.sort();
    found
}

async fn note_by_name(app: &TestApp, name: &str) -> Value {
    let list = app.get("/api/notes/list").send().await.ok();
    list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["name"] == name)
        .unwrap_or_else(|| panic!("no note named {name}"))
        .clone()
}

async fn sync_status(app: &TestApp) -> Value {
    app.get("/api/sync/status").send().await.ok()
}

#[tokio::test]
async fn server_changes_reach_a_phone_through_the_desktop() {
    let chain = Chain::new().await;
    chain
        .server
        .note(json!({ "name": "From the server", "content": "v1" }))
        .await;
    chain.round().await;
    assert_eq!(names_on(&chain.phone).await, ["From the server"]);

    let on_server = note_by_name(&chain.server, "From the server").await;
    chain
        .server
        .patch(&format!("/api/notes/{}", id(&on_server)))
        .json(json!({ "name": "From the server", "content": "v2" }))
        .send()
        .await
        .ok();
    chain.round().await;
    assert_eq!(
        note_by_name(&chain.phone, "From the server").await["content"],
        "v2"
    );
}

#[tokio::test]
async fn phone_changes_reach_the_server_through_the_desktop() {
    let chain = Chain::new().await;
    chain
        .phone
        .note(json!({ "name": "From the phone", "content": "typed on the bus" }))
        .await;
    chain.round().await;
    assert_eq!(names_on(&chain.desktop).await, ["From the phone"]);
    assert_eq!(names_on(&chain.server).await, ["From the phone"]);
}

#[tokio::test]
async fn deletes_on_the_server_reach_the_phone() {
    let chain = Chain::new().await;
    let note = chain
        .server
        .note(json!({ "name": "Short-lived", "content": "x" }))
        .await;
    chain.round().await;
    assert_eq!(names_on(&chain.phone).await, ["Short-lived"]);
    let path = format!("/api/notes/{}", id(&note));
    chain.server.delete(&path).send().await;
    chain
        .server
        .delete(&format!("{path}/permanent"))
        .send()
        .await;
    chain.round().await;
    assert!(names_on(&chain.phone).await.is_empty());
    assert!(names_on(&chain.desktop).await.is_empty());
}

#[tokio::test]
async fn relayed_changes_are_not_echoed_back_and_the_desktop_settles() {
    let chain = Chain::new().await;
    chain.server.named("Server note").await;
    chain.phone.named("Phone note").await;
    chain.round().await;
    chain.round().await;
    for app in [&chain.server, &chain.desktop, &chain.phone] {
        assert_eq!(names_on(app).await, ["Phone note", "Server note"]);
    }
    let (phone, desktop, again) = chain.round().await;
    assert_eq!((phone.pushed, phone.pulled), (0, 0));
    assert_eq!((desktop.pushed, desktop.pulled), (0, 0));
    assert_eq!((again.pushed, again.pulled), (0, 0));
    assert_eq!(sync_status(&chain.desktop).await["pending"], false);
    assert_eq!(sync_status(&chain.phone).await["pending"], false);
}

#[tokio::test]
async fn a_review_on_the_phone_reaches_the_server_and_back() {
    let chain = Chain::new().await;
    chain.server.named("Card").await;
    chain.round().await;
    let card = note_by_name(&chain.phone, "Card").await;
    chain.phone.review(&card, "good").await;
    chain.round().await;
    chain.round().await;
    for app in [&chain.server, &chain.desktop, &chain.phone] {
        let note = note_by_name(app, "Card").await;
        let ratings: Vec<&Value> = note["reminders"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|r| r.get("rating").filter(|v| !v.is_null()))
            .collect();
        assert_eq!(ratings, [&json!("good")]);
        assert_eq!(pending_count(&note), 1);
    }
}

fn pending_count(note: &Value) -> usize {
    note["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["reviewed_at"].is_null())
        .count()
}

#[tokio::test]
async fn a_phone_pairs_with_the_desktop_over_pinned_https_and_syncs() {
    let desktop = desktop_app().await;
    desktop.named("On the desktop").await;
    desktop
        .put("/api/desktop/network")
        .json(json!({ "enabled": true }))
        .send()
        .await
        .ok();
    let pairing = desktop.post("/api/desktop/network/pair").send().await.ok();
    let port = desktop.get("/api/desktop/connections").send().await.ok()["network"]["port"]
        .as_u64()
        .unwrap();
    let url = format!("https://127.0.0.1:{port}");

    let phone = desktop_app().await;
    let wrong = phone
        .put("/api/sync/remote")
        .json(json!({ "url": url, "token": pairing["token"], "fingerprint": "ab".repeat(32) }))
        .send()
        .await;
    assert_eq!(wrong.code(), 400);
    assert!(!wrong.detail().is_empty());
    assert_eq!(sync_status(&phone).await["connected"], false);

    let connected = phone
        .put("/api/sync/remote")
        .json(
            json!({ "url": url, "token": pairing["token"], "fingerprint": pairing["fingerprint"] }),
        )
        .send()
        .await;
    assert_eq!(connected.code(), 200, "{}", connected.text());
    sync(&phone).await;
    assert_eq!(names_on(&phone).await, ["On the desktop"]);

    phone.named("From the phone").await;
    sync(&phone).await;
    assert_eq!(
        names_on(&desktop).await,
        ["From the phone", "On the desktop"]
    );
    notes_again_server::lan::stop(&desktop.state).await;
}
