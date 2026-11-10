mod common;

use common::*;
use serde_json::{Value, json};

async fn edit(app: &TestApp, note: i64, name: &str, content: &str) {
    let res = app
        .patch(&format!("/api/notes/{note}"))
        .json(json!({ "name": name, "content": content }))
        .send()
        .await;
    assert_eq!(res.code(), 200);
}

async fn revisions(app: &TestApp, note: i64) -> Vec<Value> {
    app.get(&format!("/api/notes/{note}/revisions"))
        .send()
        .await
        .ok()
        .as_array()
        .unwrap()
        .clone()
}

async fn age(app: &TestApp) {
    app.exec("UPDATE note_revisions SET created_at = '2000-01-01 00:00:00.000000'")
        .await;
}

#[tokio::test]
async fn first_edit_keeps_the_original_and_rapid_autosaves_coalesce() {
    let app = TestApp::new().await;
    let note = id(&app.note(json!({ "name": "A", "content": "one" })).await);
    assert!(revisions(&app, note).await.is_empty());
    edit(&app, note, "A", "two").await;
    edit(&app, note, "A", "three").await;
    edit(&app, note, "A", "four").await;
    let list = revisions(&app, note).await;
    assert_eq!(list.len(), 1);
    let full = app
        .get(&format!("/api/notes/{note}/revisions/{}", list[0]["id"]))
        .send()
        .await
        .ok();
    assert_eq!(full["content"], "one");
    age(&app).await;
    edit(&app, note, "A", "five").await;
    let list = revisions(&app, note).await;
    assert_eq!(list.len(), 2);
    assert_eq!(list[0]["characters"], 4);
}

#[tokio::test]
async fn unchanged_saves_and_metadata_changes_record_nothing() {
    let app = TestApp::new().await;
    let note = app.note(json!({ "name": "A", "content": "one" })).await;
    let note_id = id(&note);
    edit(&app, note_id, "A", "one").await;
    app.patch(&format!("/api/notes/{note_id}/difficulty"))
        .json(json!({ "difficulty": "hard" }))
        .send()
        .await;
    assert!(revisions(&app, note_id).await.is_empty());
}

#[tokio::test]
async fn restoring_keeps_the_current_text_as_a_revision() {
    let app = TestApp::new().await;
    let note = id(&app.note(json!({ "name": "A", "content": "one" })).await);
    edit(&app, note, "B", "two").await;
    let original = revisions(&app, note).await[0]["id"].as_i64().unwrap();
    let restored = app
        .post(&format!("/api/notes/{note}/revisions/{original}/restore"))
        .send()
        .await
        .ok();
    assert_eq!(restored["content"], "one");
    assert_eq!(restored["name"], "A");
    let list = revisions(&app, note).await;
    assert_eq!(list.len(), 2);
    let newest = app
        .get(&format!("/api/notes/{note}/revisions/{}", list[0]["id"]))
        .send()
        .await
        .ok();
    assert_eq!(newest["content"], "two");
    assert_eq!(newest["name"], "B");
}

#[tokio::test]
async fn revisions_are_bounded_and_belong_to_their_note() {
    let app = TestApp::new().await;
    let note = id(&app.note(json!({ "name": "A", "content": "v0" })).await);
    let other = id(&app.note(json!({ "name": "O", "content": "x" })).await);
    for n in 1..=55 {
        age(&app).await;
        edit(&app, note, "A", &format!("v{n}")).await;
    }
    assert_eq!(revisions(&app, note).await.len(), 50);
    edit(&app, other, "O", "y").await;
    let foreign = revisions(&app, other).await[0]["id"].as_i64().unwrap();
    for res in [
        app.get(&format!("/api/notes/{note}/revisions/{foreign}"))
            .send()
            .await,
        app.post(&format!("/api/notes/{note}/revisions/{foreign}/restore"))
            .send()
            .await,
        app.get("/api/notes/9999/revisions").send().await,
    ] {
        assert_eq!(res.code(), 404);
    }
}

#[tokio::test]
async fn deleting_a_note_for_good_removes_its_revisions_but_trash_keeps_them() {
    let app = TestApp::new().await;
    let note = id(&app.note(json!({ "name": "A", "content": "one" })).await);
    edit(&app, note, "A", "two").await;
    assert_eq!(
        app.delete(&format!("/api/notes/{note}"))
            .send()
            .await
            .code(),
        204
    );
    assert_eq!(
        app.scalar_i64("SELECT COUNT(*) FROM note_revisions").await,
        1
    );
    assert_eq!(
        app.get(&format!("/api/notes/{note}/revisions"))
            .send()
            .await
            .code(),
        404
    );
    assert_eq!(
        app.delete(&format!("/api/notes/{note}/permanent"))
            .send()
            .await
            .code(),
        204
    );
    assert_eq!(
        app.scalar_i64("SELECT COUNT(*) FROM note_revisions").await,
        0
    );
}
