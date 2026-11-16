mod common;

use common::*;
use notes_again_server::sync::vault;
use serde_json::{Value, json};
use std::path::Path;

async fn device(folder: &Path) -> TestApp {
    let app = TestApp::new().await;
    vault::connect(&app.state, folder).await.unwrap();
    app
}

async fn sync(app: &TestApp) -> vault::VaultOutcome {
    let _guard = app.state.sync_lock.lock().await;
    vault::sync_once(&app.state)
        .await
        .unwrap_or_else(|e| panic!("vault sync failed: {e:?}"))
}

async fn settle(a: &TestApp, b: &TestApp) {
    for _ in 0..3 {
        sync(a).await;
        sync(b).await;
    }
}

async fn note(app: &TestApp, uid: &str) -> Option<Value> {
    let listed = app.get("/api/notes/list?limit=100").send().await.ok();
    let id = listed["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["uid"] == uid)
        .map(|n| n["id"].clone());
    match id {
        Some(id) => Some(app.get(&format!("/api/notes/{id}")).send().await.ok()),
        None => None,
    }
}

#[tokio::test]
async fn two_devices_share_notes_edits_and_deletions_through_a_folder() {
    let folder = tempfile::tempdir().unwrap();
    let a = device(folder.path()).await;
    let b = device(folder.path()).await;

    let created = a.note(json!({ "name": "Shared", "content": "one" })).await;
    let uid = created["uid"].as_str().unwrap().to_string();
    settle(&a, &b).await;
    let on_b = note(&b, &uid)
        .await
        .expect("note reached the second device");
    assert_eq!(on_b["content"], "one");

    b.patch(&format!("/api/notes/{}", id(&on_b)))
        .json(json!({ "name": "Shared", "content": "two" }))
        .send()
        .await;
    settle(&a, &b).await;
    assert_eq!(note(&a, &uid).await.unwrap()["content"], "two");

    a.delete(&format!("/api/notes/{}", id(&created)))
        .send()
        .await;
    a.delete("/api/notes/trash").send().await;
    settle(&a, &b).await;
    assert!(note(&b, &uid).await.is_none());
}

#[tokio::test]
async fn a_second_sync_with_nothing_new_moves_nothing() {
    let folder = tempfile::tempdir().unwrap();
    let a = device(folder.path()).await;
    let b = device(folder.path()).await;
    a.note(json!({ "name": "N", "content": "x" })).await;
    settle(&a, &b).await;
    let again_a = sync(&a).await;
    let again_b = sync(&b).await;
    assert_eq!((again_a.pushed, again_a.pulled), (0, 0));
    assert_eq!((again_b.pushed, again_b.pulled), (0, 0));
}

#[tokio::test]
async fn offline_edits_on_both_devices_merge_or_become_a_conflict() {
    let folder = tempfile::tempdir().unwrap();
    let a = device(folder.path()).await;
    let b = device(folder.path()).await;
    let created = a
        .note(json!({ "name": "Both", "content": "base text" }))
        .await;
    let uid = created["uid"].as_str().unwrap().to_string();
    settle(&a, &b).await;
    let on_b = note(&b, &uid).await.unwrap();

    a.patch(&format!("/api/notes/{}", id(&created)))
        .json(json!({ "name": "Both", "content": "edited on a" }))
        .send()
        .await;
    b.patch(&format!("/api/notes/{}", id(&on_b)))
        .json(json!({ "name": "Both", "content": "edited on b" }))
        .send()
        .await;
    settle(&a, &b).await;

    let conflicts_a = a.scalar_i64("SELECT COUNT(*) FROM sync_conflicts").await;
    let conflicts_b = b.scalar_i64("SELECT COUNT(*) FROM sync_conflicts").await;
    assert!(
        conflicts_a + conflicts_b > 0,
        "both text edits must surface a conflict"
    );
    assert_eq!(note(&a, &uid).await.unwrap()["content"], "edited on a");
    assert_eq!(note(&b, &uid).await.unwrap()["content"], "edited on b");
}

#[tokio::test]
async fn a_device_joining_later_catches_up_and_unreadable_batches_are_retried() {
    let folder = tempfile::tempdir().unwrap();
    let a = device(folder.path()).await;
    let created = a.note(json!({ "name": "Early", "content": "e" })).await;
    sync(&a).await;
    let late = device(folder.path()).await;
    sync(&late).await;
    assert!(
        note(&late, created["uid"].as_str().unwrap())
            .await
            .is_some()
    );

    let device_dir = folder
        .path()
        .join("notes-again-vault/devices")
        .join(vault::vault_row(&a.state).await.unwrap().unwrap().device_id);
    std::fs::write(device_dir.join("0000000099.json"), b"{not json").unwrap();
    a.note(json!({ "name": "After", "content": "a" })).await;
    sync(&a).await;
    sync(&late).await;
    assert!(
        late.get("/api/notes/list?limit=100").send().await.ok()["total"]
            .as_i64()
            .unwrap()
            >= 2
    );
}

#[tokio::test]
async fn attachments_travel_with_their_bytes() {
    let folder = tempfile::tempdir().unwrap();
    let a = device(folder.path()).await;
    let b = device(folder.path()).await;
    let created = a.note(json!({ "name": "Pic", "content": "x" })).await;
    let uploaded = a
        .post(&format!("/api/notes/{}/attachments", id(&created)))
        .header("x-file-name", "dot.gif")
        .raw("application/octet-stream", "GIF89a-pixels")
        .send()
        .await
        .ok();
    let uid = uploaded["uid"].as_str().unwrap().to_string();
    settle(&a, &b).await;
    let file = b.get(&format!("/api/attachments/{uid}/file")).send().await;
    assert_eq!(file.code(), 200);
}

#[tokio::test]
async fn a_device_that_syncs_with_a_server_cannot_also_use_a_vault() {
    let folder = tempfile::tempdir().unwrap();
    let app = TestApp::new().await;
    sqlx::query(
        "INSERT INTO sync_remote (id, url, token, pushed_version, pulled_version, created_at) \
         VALUES (1, 'http://x.test', 't', 0, 0, ?)",
    )
    .bind(notes_again_server::time::Ts::now())
    .execute(&app.state.db)
    .await
    .unwrap();
    assert!(vault::connect(&app.state, folder.path()).await.is_err());
}

#[tokio::test]
async fn a_resolved_conflict_settles_on_every_device() {
    let folder = tempfile::tempdir().unwrap();
    let a = device(folder.path()).await;
    let b = device(folder.path()).await;
    let created = a
        .note(json!({ "name": "Both", "content": "base text" }))
        .await;
    let uid = created["uid"].as_str().unwrap().to_string();
    settle(&a, &b).await;
    let on_b = note(&b, &uid).await.unwrap();
    a.patch(&format!("/api/notes/{}", id(&created)))
        .json(json!({ "name": "Both", "content": "edited on a" }))
        .send()
        .await;
    b.patch(&format!("/api/notes/{}", id(&on_b)))
        .json(json!({ "name": "Both", "content": "edited on b" }))
        .send()
        .await;
    settle(&a, &b).await;

    let holder = if a.scalar_i64("SELECT COUNT(*) FROM sync_conflicts").await > 0 {
        &a
    } else {
        &b
    };
    let resolved = notes_again_server::sync::client::resolve_conflict(
        &holder.state,
        &uid,
        "Both",
        "resolved text",
    )
    .await
    .unwrap();
    assert!(resolved);
    settle(&a, &b).await;
    settle(&a, &b).await;
    assert_eq!(note(&a, &uid).await.unwrap()["content"], "resolved text");
    assert_eq!(note(&b, &uid).await.unwrap()["content"], "resolved text");
    assert_eq!(a.scalar_i64("SELECT COUNT(*) FROM sync_conflicts").await, 0);
    assert_eq!(b.scalar_i64("SELECT COUNT(*) FROM sync_conflicts").await, 0);
}

#[tokio::test]
async fn three_devices_converge_and_same_named_projects_are_merged() {
    let folder = tempfile::tempdir().unwrap();
    let a = device(folder.path()).await;
    let b = device(folder.path()).await;
    let c = device(folder.path()).await;
    a.post("/api/projects/create")
        .json(json!({ "name": "Reading" }))
        .send()
        .await;
    b.post("/api/projects/create")
        .json(json!({ "name": "Reading" }))
        .send()
        .await;
    let created = a.note(json!({ "name": "From a", "content": "a" })).await;
    for _ in 0..4 {
        sync(&a).await;
        sync(&b).await;
        sync(&c).await;
    }
    let uid = created["uid"].as_str().unwrap();
    assert!(note(&b, uid).await.is_some());
    assert!(note(&c, uid).await.is_some());
    for app in [&a, &b, &c] {
        assert_eq!(
            app.scalar_i64("SELECT COUNT(*) FROM projects WHERE name = 'Reading'")
                .await,
            1
        );
    }
}

#[tokio::test]
async fn the_desktop_api_connects_runs_and_disconnects_a_folder_vault() {
    use notes_again_server::config::AuthMode;
    let secret = "launch-secret";
    let app = TestApp::with(|c| {
        c.auth_mode = AuthMode::Desktop;
        c.desktop_secret = Some(secret.into());
    })
    .await;
    app.get(&format!("/api/auth/desktop?secret={secret}"))
        .send()
        .await;
    let folder = tempfile::tempdir().unwrap();

    let missing = app
        .put("/api/sync/vault")
        .json(json!({ "folder": "/definitely/not/a/folder" }))
        .send()
        .await;
    assert_eq!(missing.code(), 422);

    let connected = app
        .put("/api/sync/vault")
        .json(json!({ "folder": folder.path().to_string_lossy() }))
        .send()
        .await;
    assert_eq!(connected.code(), 200);
    let status = connected.ok();
    assert_eq!(status["connected"], true);
    assert_eq!(status["kind"], "folder");

    app.note(json!({ "name": "Local", "content": "x" })).await;
    let ran = app.post("/api/sync/run").send().await.ok();
    assert!(ran["last_error"].is_null());
    assert!(folder.path().join("notes-again-vault/vault.json").is_file());

    let again = app
        .put("/api/sync/vault")
        .json(json!({ "folder": folder.path().to_string_lossy() }))
        .send()
        .await;
    assert_eq!(again.code(), 409);

    assert_eq!(app.delete("/api/sync/remote").send().await.code(), 204);
    let after = app.get("/api/sync/status").send().await.ok();
    assert_eq!(after["connected"], false);
}
