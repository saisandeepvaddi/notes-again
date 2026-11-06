mod common;

use common::*;
use notes_again_server::config::AuthMode;
use notes_again_server::sync::client::{Remote, SyncOutcome, resolve_conflict, sync_once};
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

struct Pair {
    server: TestApp,
    served: Served,
}

impl Pair {
    async fn new() -> Pair {
        let server = TestApp::new().await;
        let served = server.serve().await;
        Pair { server, served }
    }

    async fn desktop(&self) -> TestApp {
        let app = desktop().await;
        sqlx::query(
            "INSERT INTO sync_remote (id, url, token, pushed_version, pulled_version, created_at) \
             VALUES (1, ?, 'unused', 0, 0, ?)",
        )
        .bind(&self.served.url)
        .bind(notes_again_server::time::Ts::now())
        .execute(&app.state.db)
        .await
        .unwrap();
        app
    }

    async fn server_id(&self, uid: &str) -> i64 {
        self.server
            .scalar_i64(&format!("SELECT id FROM notes WHERE uid = '{uid}'"))
            .await
    }

    async fn server_note(&self, uid: &str) -> Value {
        let id = self.server_id(uid).await;
        self.server
            .get(&format!("/api/notes/{id}"))
            .send()
            .await
            .ok()
    }

    async fn edit_server(&self, uid: &str, name: &str, content: &str) {
        let id = self.server_id(uid).await;
        self.server
            .patch(&format!("/api/notes/{id}"))
            .json(json!({ "name": name, "content": content }))
            .send()
            .await
            .ok();
    }
}

async fn sync(desktop: &TestApp) -> SyncOutcome {
    let state = &desktop.state;
    let _guard = state.sync_lock.lock().await;
    let (url, token): (String, String) =
        sqlx::query_as("SELECT url, token FROM sync_remote WHERE id = 1")
            .fetch_one(&state.db)
            .await
            .unwrap();
    sync_once(state, &Remote::new(&url, Some(&token)))
        .await
        .unwrap_or_else(|e| panic!("sync failed: {e:?}"))
}

async fn conflicts(desktop: &TestApp) -> i64 {
    desktop
        .scalar_i64("SELECT count(*) FROM sync_conflicts")
        .await
}

async fn add_note(
    desktop: &TestApp,
    name: &str,
    content: &str,
    project: Option<&str>,
    tags: &[&str],
) -> String {
    let mut body = json!({ "name": name, "content": content });
    if let Some(project) = project {
        body["project_id"] = json!(id(&desktop.project(project).await));
    }
    let mut tag_ids = vec![];
    for tag in tags {
        tag_ids.push(id(&desktop.tag(tag).await));
    }
    body["tag_ids"] = json!(tag_ids);
    let note = desktop.note(body).await;
    uid_of(desktop, id(&note)).await
}

async fn uid_of(app: &TestApp, note_id: i64) -> String {
    app.scalar_opt_str(&format!("SELECT uid FROM notes WHERE id = {note_id}"))
        .await
        .unwrap()
}

async fn local_id(desktop: &TestApp, uid: &str) -> Option<i64> {
    sqlx::query_scalar("SELECT id FROM notes WHERE uid = ?")
        .bind(uid)
        .fetch_optional(&desktop.state.db)
        .await
        .unwrap()
}

async fn local_note(desktop: &TestApp, uid: &str) -> Option<Value> {
    let id = local_id(desktop, uid).await?;
    let response = desktop.get(&format!("/api/notes/{id}")).send().await;
    (response.code() == 200).then(|| response.json())
}

async fn edit_local(desktop: &TestApp, uid: &str, name: &str, content: &str) {
    let id = local_id(desktop, uid).await.unwrap();
    desktop
        .patch(&format!("/api/notes/{id}"))
        .json(json!({ "name": name, "content": content }))
        .send()
        .await
        .ok();
}

async fn review_local(desktop: &TestApp, uid: &str, rating: &str) {
    let note = local_note(desktop, uid).await.unwrap();
    desktop.review(&note, rating).await;
}

fn ratings(note: &Value) -> Vec<String> {
    note["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|r| r["rating"].as_str().map(str::to_string))
        .collect()
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
async fn a_note_written_on_one_desktop_reaches_the_server_and_another_desktop() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let uid = add_note(&desk, "Rust ownership", "Moves", Some("Rust"), &["lang"]).await;
    assert!(sync(&desk).await.pushed > 0);

    let on_server = pair.server_note(&uid).await;
    assert_eq!(on_server["name"], "Rust ownership");
    assert_eq!(on_server["project"]["name"], "Rust");
    assert_eq!(sorted(names(&on_server["tags"])), ["Medium", "lang"]);
    let server_tags = names(&pair.server.get("/api/tags/list").send().await.ok());
    assert_eq!(server_tags.iter().filter(|t| *t == "Medium").count(), 1);

    let laptop = pair.desktop().await;
    sync(&laptop).await;
    let copy = local_note(&laptop, &uid).await.expect("synced copy");
    assert_eq!(copy["content"], "Moves");
    assert_eq!(copy["project"]["name"], "Rust");
    assert_eq!(sorted(names(&copy["tags"])), ["Medium", "lang"]);
    assert_eq!(pending_count(&copy), 1);
}

#[tokio::test]
async fn syncing_again_without_changes_moves_nothing() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    add_note(&desk, "Stable", "body", None, &[]).await;
    sync(&desk).await;
    let again = sync(&desk).await;
    assert_eq!((again.pushed, again.pulled), (0, 0));
    assert_eq!(conflicts(&desk).await, 0);
}

#[tokio::test]
async fn server_edits_reach_the_desktop_and_different_notes_both_survive() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let first = add_note(&desk, "First", "body", None, &[]).await;
    let second = add_note(&desk, "Second", "body", None, &[]).await;
    sync(&desk).await;
    edit_local(&desk, &first, "First", "Desktop edit").await;
    pair.edit_server(&second, "Second", "Web edit").await;
    sync(&desk).await;
    assert_eq!(conflicts(&desk).await, 0);
    assert_eq!(pair.server_note(&first).await["content"], "Desktop edit");
    assert_eq!(
        local_note(&desk, &second).await.unwrap()["content"],
        "Web edit"
    );
}

async fn conflicted() -> (Pair, TestApp, String) {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let uid = add_note(&desk, "Shared", "Original", None, &[]).await;
    sync(&desk).await;
    edit_local(&desk, &uid, "Shared", "Mine").await;
    pair.edit_server(&uid, "Shared", "Theirs").await;
    sync(&desk).await;
    (pair, desk, uid)
}

async fn their_content(desk: &TestApp, uid: &str) -> Option<String> {
    sqlx::query_scalar("SELECT their_content FROM sync_conflicts WHERE note_uid = ?")
        .bind(uid)
        .fetch_optional(&desk.state.db)
        .await
        .unwrap()
}

#[tokio::test]
async fn editing_the_same_note_on_both_sides_is_a_conflict_until_resolved() {
    let (pair, desk, uid) = conflicted().await;
    assert_eq!(conflicts(&desk).await, 1);
    assert_eq!(local_note(&desk, &uid).await.unwrap()["content"], "Mine");
    assert_eq!(pair.server_note(&uid).await["content"], "Theirs");
    assert_eq!(their_content(&desk, &uid).await.as_deref(), Some("Theirs"));

    sync(&desk).await;
    assert_eq!(conflicts(&desk).await, 1);
    assert_eq!(pair.server_note(&uid).await["content"], "Theirs");

    assert!(
        resolve_conflict(&desk.state, &uid, "Shared", "Mine")
            .await
            .unwrap()
    );
    sync(&desk).await;
    assert_eq!(conflicts(&desk).await, 0);
    assert_eq!(pair.server_note(&uid).await["content"], "Mine");
    assert_eq!(local_note(&desk, &uid).await.unwrap()["content"], "Mine");
}

#[tokio::test]
async fn taking_their_version_resolves_a_conflict() {
    let (pair, desk, uid) = conflicted().await;
    resolve_conflict(&desk.state, &uid, "Shared", "Theirs")
        .await
        .unwrap();
    sync(&desk).await;
    assert_eq!(local_note(&desk, &uid).await.unwrap()["content"], "Theirs");
    assert_eq!(pair.server_note(&uid).await["content"], "Theirs");
}

#[tokio::test]
async fn a_later_web_edit_updates_the_open_conflict() {
    let (pair, desk, uid) = conflicted().await;
    pair.edit_server(&uid, "Shared", "Theirs v2").await;
    sync(&desk).await;
    assert_eq!(
        their_content(&desk, &uid).await.as_deref(),
        Some("Theirs v2")
    );
    assert_eq!(local_note(&desk, &uid).await.unwrap()["content"], "Mine");
}

#[tokio::test]
async fn an_offline_review_merges_with_a_web_edit() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let uid = add_note(&desk, "Card", "Front", None, &[]).await;
    sync(&desk).await;
    review_local(&desk, &uid, "good").await;
    pair.edit_server(&uid, "Card", "Edited").await;
    sync(&desk).await;
    assert_eq!(conflicts(&desk).await, 0);
    let on_server = pair.server_note(&uid).await;
    assert_eq!(on_server["content"], "Edited");
    assert_eq!(ratings(&on_server), ["good"]);
    assert_eq!(pending_count(&on_server), 1);
    assert_eq!(local_note(&desk, &uid).await.unwrap()["content"], "Edited");
}

#[tokio::test]
async fn reviewing_the_same_card_on_two_devices_keeps_the_earlier_review() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let uid = add_note(&desk, "Card", "body", None, &[]).await;
    sync(&desk).await;
    let laptop = pair.desktop().await;
    sync(&laptop).await;

    review_local(&desk, &uid, "good").await;
    review_local(&laptop, &uid, "again").await;
    sync(&desk).await;
    sync(&laptop).await;
    sync(&desk).await;

    let on_server = pair.server_note(&uid).await;
    assert_eq!(ratings(&on_server), ["good"]);
    assert_eq!(pending_count(&on_server), 1);
    for device in [&desk, &laptop] {
        let note = local_note(device, &uid).await.unwrap();
        assert_eq!(ratings(&note), ["good"]);
        assert_eq!(pending_count(&note), 1);
    }
}

#[tokio::test]
async fn trashing_and_deleting_forever_propagate() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let old = add_note(&desk, "Old", "body", None, &[]).await;
    let gone = add_note(&desk, "Gone", "body", None, &[]).await;
    sync(&desk).await;

    let local = local_id(&desk, &old).await.unwrap();
    desk.delete(&format!("/api/notes/{local}")).send().await;
    let server_gone = pair.server_id(&gone).await;
    pair.server
        .delete(&format!("/api/notes/{server_gone}"))
        .send()
        .await;
    pair.server
        .delete(&format!("/api/notes/{server_gone}/permanent"))
        .send()
        .await;
    sync(&desk).await;

    let trashed = pair
        .server
        .get("/api/notes/list?deleted=true")
        .send()
        .await
        .ok();
    assert_eq!(names(&trashed["items"]), ["Old"]);
    assert!(local_id(&desk, &gone).await.is_none());
}

#[tokio::test]
async fn editing_a_note_the_web_trashed_brings_it_back() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let uid = add_note(&desk, "Keep me", "v1", None, &[]).await;
    sync(&desk).await;
    let server_id = pair.server_id(&uid).await;
    pair.server
        .delete(&format!("/api/notes/{server_id}"))
        .send()
        .await;
    edit_local(&desk, &uid, "Keep me", "v2").await;
    sync(&desk).await;
    let on_server = pair
        .server
        .get(&format!("/api/notes/{server_id}"))
        .send()
        .await;
    assert_eq!(on_server.code(), 200);
    assert_eq!(on_server.json()["content"], "v2");
}

#[tokio::test]
async fn a_tag_created_on_both_sides_merges_into_one() {
    let pair = Pair::new().await;
    pair.server.tag("python").await;
    let desk = pair.desktop().await;
    let uid = add_note(&desk, "Typing", "body", None, &["Python"]).await;
    sync(&desk).await;
    let server_tags = names(&pair.server.get("/api/tags/list").send().await.ok());
    assert_eq!(server_tags.iter().filter(|t| *t == "python").count(), 1);
    assert!(!server_tags.contains(&"Python".to_string()));
    assert!(names(&pair.server_note(&uid).await["tags"]).contains(&"python".to_string()));
    let local: Vec<String> = sqlx::query_scalar("SELECT name FROM tags WHERE is_difficulty = 0")
        .fetch_all(&desk.state.db)
        .await
        .unwrap();
    assert_eq!(local, ["python"]);
}

#[tokio::test]
async fn a_new_desktop_adopts_the_servers_settings() {
    let pair = Pair::new().await;
    pair.server.use_sm2().await;
    let desk = pair.desktop().await;
    sync(&desk).await;
    assert_eq!(
        desk.get("/api/settings").send().await.ok()["default_algorithm"],
        "sm2"
    );
}

#[tokio::test]
async fn a_project_deleted_on_the_server_unfiles_desktop_notes() {
    let pair = Pair::new().await;
    let desk = pair.desktop().await;
    let uid = add_note(&desk, "Filed", "body", Some("Temp"), &[]).await;
    sync(&desk).await;
    let project = id(&pair.server_note(&uid).await["project"]);
    pair.server
        .delete(&format!("/api/projects/{project}"))
        .send()
        .await
        .ok();
    sync(&desk).await;
    assert!(local_note(&desk, &uid).await.unwrap()["project"].is_null());
    assert_eq!(
        desk.scalar_i64("SELECT count(*) FROM projects WHERE name = 'Temp'")
            .await,
        0
    );
}

#[tokio::test]
async fn pulled_changes_are_not_pushed_back() {
    let pair = Pair::new().await;
    for i in 0..3 {
        pair.server
            .note(json!({ "name": format!("Web {i}"), "content": "x" }))
            .await;
    }
    let desk = pair.desktop().await;
    sync(&desk).await;
    assert_eq!(desk.scalar_i64("SELECT count(*) FROM notes").await, 3);
    assert_eq!(desk.scalar_i64("SELECT count(*) FROM reminders").await, 3);
    assert_eq!(sync(&desk).await.pushed, 0);
}

async fn local_server() -> (TestApp, Served, String) {
    let server = TestApp::with(|c| c.auth_mode = AuthMode::Local).await;
    let served = server.serve().await;
    let password = server
        .scalar_opt_str("SELECT initial_password FROM local_auth WHERE id = 1")
        .await
        .unwrap();
    (server, served, password)
}

async fn connect(desk: &TestApp, body: Value) -> Res {
    let response = desk.put("/api/sync/remote").json(body).send().await;
    desk.post("/api/sync/run").send().await;
    response
}

async fn status(desk: &TestApp) -> Value {
    desk.get("/api/sync/status").send().await.ok()
}

#[tokio::test]
async fn a_fresh_desktop_is_not_connected() {
    let desk = desktop().await;
    assert_eq!(status(&desk).await["connected"], false);
}

#[tokio::test]
async fn connecting_with_a_password_trades_it_for_a_token_and_syncs() {
    let (server, served, password) = local_server().await;
    let desk = desktop().await;
    desk.named("From the desktop").await;
    let response = connect(
        &desk,
        json!({ "url": format!("{}/api/", served.url), "username": "admin", "password": password }),
    )
    .await;
    assert_eq!(response.json()["url"], served.url);
    let now = status(&desk).await;
    assert_eq!(now["connected"], true);
    assert_eq!(now["username"], "admin");
    assert!(now["last_error"].is_null(), "{now}");
    assert!(!now["last_synced_at"].is_null());
    assert_eq!(now["pending"], false);
    let token_scope = server.scalar_opt_str("SELECT scope FROM api_tokens").await;
    assert_eq!(token_scope.as_deref(), Some("app"));
    assert_eq!(
        server
            .scalar_i64("SELECT count(*) FROM notes WHERE name = 'From the desktop'")
            .await,
        1
    );

    assert_eq!(desk.delete("/api/sync/remote").send().await.code(), 204);
    assert_eq!(status(&desk).await["connected"], false);
    assert_eq!(desk.scalar_i64("SELECT count(*) FROM sync_bases").await, 0);
    assert_eq!(
        server
            .scalar_i64("SELECT count(*) FROM api_tokens WHERE revoked_at IS NULL")
            .await,
        0
    );
}

#[tokio::test]
async fn a_wrong_password_is_reported_and_nothing_is_saved() {
    let (_server, served, _) = local_server().await;
    let desk = desktop().await;
    let response = connect(
        &desk,
        json!({ "url": served.url, "username": "admin", "password": "wrong" }),
    )
    .await;
    assert_eq!(response.code(), 400);
    assert_eq!(response.detail(), "Wrong username or password.");
    assert_eq!(status(&desk).await["connected"], false);
}

#[tokio::test]
async fn a_capture_token_or_a_server_without_sync_is_explained() {
    let (server, served, password) = local_server().await;
    let login = server
        .post("/api/auth/login")
        .json(json!({ "username": "admin", "password": password }))
        .send()
        .await;
    assert_eq!(login.code(), 204);
    let capture = server
        .post("/api/tokens/create")
        .json(json!({ "name": "Ext" }))
        .send()
        .await
        .ok();
    let desk = desktop().await;
    let response = connect(
        &desk,
        json!({ "url": served.url, "token": capture["token"] }),
    )
    .await;
    assert_eq!(response.code(), 400);
    assert!(response.detail().contains("can only capture"));

    let old = axum::Router::new().route(
        "/api/auth/token",
        axum::routing::post(|| async { axum::Json(json!({ "token": "nal_old" })) }),
    );
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let old_url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, old).await });
    let response = connect(
        &desk,
        json!({ "url": old_url, "username": "me", "password": "right" }),
    )
    .await;
    assert_eq!(response.code(), 400);
    assert!(response.detail().contains("doesn't support sync"));
}

#[tokio::test]
async fn an_unreachable_server_is_recorded_as_the_last_error() {
    let pair = Pair::new().await;
    let desk = desktop().await;
    let mut pair = pair;
    connect(
        &desk,
        json!({ "url": pair.served.url, "token": "anything" }),
    )
    .await;
    assert!(status(&desk).await["last_error"].is_null());
    pair.served.stop().await;
    let after = desk.post("/api/sync/run").send().await.ok();
    let error = after["last_error"].as_str().unwrap();
    assert!(
        error.starts_with(&format!("Couldn't reach {}", pair.served.url)),
        "{error}"
    );
}

#[tokio::test]
async fn a_conflict_is_listed_and_resolved_with_the_chosen_text() {
    let desk = desktop().await;
    let note = desk
        .note(json!({ "name": "Shared", "content": "Mine" }))
        .await;
    let uid = uid_of(&desk, id(&note)).await;
    sqlx::query(
        "INSERT INTO sync_conflicts (note_uid, their_name, their_content, detected_at) VALUES (?, 'Shared', 'Theirs', ?)",
    )
    .bind(&uid)
    .bind(notes_again_server::time::Ts::now())
    .execute(&desk.state.db)
    .await
    .unwrap();
    let listed = desk.get("/api/sync/conflicts").send().await.ok();
    assert_eq!(listed.as_array().unwrap().len(), 1);
    assert_eq!(listed[0]["note_id"], note["id"]);
    assert_eq!(listed[0]["content"], "Mine");
    assert_eq!(listed[0]["their_content"], "Theirs");
    let path = format!("/api/sync/conflicts/{}/resolve", id(&note));
    let resolved = desk
        .post(&path)
        .json(json!({ "name": "Shared", "content": "Merged" }))
        .send()
        .await;
    assert_eq!(resolved.code(), 204);
    assert_eq!(desk.get("/api/sync/conflicts").send().await.ok(), json!([]));
    assert_eq!(
        desk.get(&format!("/api/notes/{}", id(&note)))
            .send()
            .await
            .ok()["content"],
        "Merged"
    );
    let again = desk
        .post(&path)
        .json(json!({ "name": "Shared", "content": "Again" }))
        .send()
        .await;
    assert_eq!(again.code(), 404);
}
