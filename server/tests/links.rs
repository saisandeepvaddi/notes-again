mod common;

use common::*;
use serde_json::{Value, json};

async fn backlinks(app: &TestApp, note: i64) -> Vec<Value> {
    app.get(&format!("/api/notes/{note}/backlinks"))
        .send()
        .await
        .ok()
        .as_array()
        .unwrap()
        .clone()
}

#[tokio::test]
async fn backlinks_follow_links_by_stable_id_through_renames_and_trash() {
    let app = TestApp::new().await;
    let target = app
        .note(json!({ "name": "Target", "content": "body" }))
        .await;
    let uid = target["uid"].as_str().unwrap().to_string();
    let target = id(&target);
    let source = id(&app
        .note(json!({
            "name": "Source",
            "content": format!("intro\nSee [Old name](note:{uid}) for more.")
        }))
        .await);
    app.note(json!({ "name": "Plain", "content": format!("note:{uid} without a link") }))
        .await;

    let found = backlinks(&app, target).await;
    assert_eq!(found.len(), 1);
    assert_eq!(found[0]["id"], source);
    assert!(found[0]["snippet"].as_str().unwrap().contains("Old name"));

    app.patch(&format!("/api/notes/{target}"))
        .json(json!({ "name": "Renamed" }))
        .send()
        .await;
    assert_eq!(backlinks(&app, target).await.len(), 1);

    app.delete(&format!("/api/notes/{source}")).send().await;
    assert!(backlinks(&app, target).await.is_empty());
}

#[tokio::test]
async fn link_targets_resolve_current_titles_and_flag_trashed_notes() {
    let app = TestApp::new().await;
    let live = app.note(json!({ "name": "Live", "content": "x" })).await;
    let gone = app.note(json!({ "name": "Gone", "content": "x" })).await;
    app.delete(&format!("/api/notes/{}", id(&gone)))
        .send()
        .await;
    let (live_uid, gone_uid) = (live["uid"].as_str().unwrap(), gone["uid"].as_str().unwrap());
    let missing = "0".repeat(32);
    let res = app
        .get(&format!(
            "/api/notes/link-targets?uids={live_uid},{gone_uid},{missing}"
        ))
        .send()
        .await
        .ok();
    let rows = res.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    let by = |uid: &str| rows.iter().find(|row| row["uid"] == uid).unwrap();
    assert_eq!(by(live_uid)["name"], "Live");
    assert_eq!(by(live_uid)["trashed"], false);
    assert_eq!(by(gone_uid)["trashed"], true);

    let bad = app.get("/api/notes/link-targets?uids=nope").send().await;
    assert_eq!(bad.code(), 400);
}

#[tokio::test]
async fn search_results_carry_the_uid_used_for_links() {
    let app = TestApp::new().await;
    let note = app
        .note(json!({ "name": "Linkable zebra", "content": "x" }))
        .await;
    let res = app.get("/api/search?q=zebra").send().await.ok();
    assert_eq!(res["notes"][0]["uid"], note["uid"]);
}
