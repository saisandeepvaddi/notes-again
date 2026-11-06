mod common;

use common::*;
use serde_json::Value;

async fn post(app: &TestApp, path: &str, body: Value) -> Res {
    app.post(path).json(body).send().await
}

async fn two(app: &TestApp) -> (i64, i64) {
    (id(&app.named("A").await), id(&app.named("B").await))
}

async fn fetch(app: &TestApp, note: i64) -> Res {
    app.get(&format!("/api/notes/{note}")).send().await
}

#[tokio::test]
async fn bulk_delete_trashes_the_given_notes_and_skips_the_rest() {
    let app = TestApp::new().await;
    let (a, b) = two(&app).await;
    let result = post(
        &app,
        "/api/notes/bulk/delete",
        json!({ "note_ids": [a, 999] }),
    )
    .await;
    assert_eq!(result.ok(), json!({ "affected": 1 }));
    assert_eq!(fetch(&app, a).await.code(), 404);
    assert_eq!(fetch(&app, b).await.code(), 200);
}

#[tokio::test]
async fn bulk_delete_ignores_duplicate_ids() {
    let app = TestApp::new().await;
    let (a, _) = two(&app).await;
    let result = post(
        &app,
        "/api/notes/bulk/delete",
        json!({ "note_ids": [a, a] }),
    )
    .await;
    assert_eq!(result.ok(), json!({ "affected": 1 }));
}

#[tokio::test]
async fn bulk_restore_and_permanent_only_touch_trashed_notes() {
    let app = TestApp::new().await;
    let (a, b) = two(&app).await;
    app.delete(&format!("/api/notes/{a}")).send().await;
    let restored = post(
        &app,
        "/api/notes/bulk/restore",
        json!({ "note_ids": [a, b] }),
    )
    .await;
    assert_eq!(restored.ok(), json!({ "affected": 1 }));
    assert_eq!(fetch(&app, a).await.code(), 200);
    app.delete(&format!("/api/notes/{a}")).send().await;
    let purged = post(
        &app,
        "/api/notes/bulk/permanent",
        json!({ "note_ids": [a, b] }),
    )
    .await;
    assert_eq!(purged.ok(), json!({ "affected": 1 }));
    assert_eq!(fetch(&app, b).await.code(), 200);
}

#[tokio::test]
async fn bulk_too_many_ids_400s() {
    let app = TestApp::new().await;
    let ids: Vec<i64> = (0..10_001).collect();
    let response = post(&app, "/api/notes/bulk/delete", json!({ "note_ids": ids })).await;
    assert_eq!(response.code(), 400);
}

#[tokio::test]
async fn bulk_set_project_moves_every_note_and_404s_on_unknown() {
    let app = TestApp::new().await;
    let (a, b) = two(&app).await;
    let project = app.project("P").await;
    let result = post(
        &app,
        "/api/notes/bulk/project",
        json!({ "note_ids": [a, b], "project_id": id(&project) }),
    )
    .await;
    assert_eq!(result.ok(), json!({ "affected": 2 }));
    for note in [a, b] {
        assert_eq!(fetch(&app, note).await.ok()["project"]["id"], project["id"]);
    }
    let unknown = post(
        &app,
        "/api/notes/bulk/project",
        json!({ "note_ids": [a], "project_id": 999 }),
    )
    .await;
    assert_eq!(unknown.code(), 404);
}

#[tokio::test]
async fn bulk_add_and_remove_tags_idempotently() {
    let app = TestApp::new().await;
    let (a, b) = two(&app).await;
    let tag = id(&app.tag("rust").await);
    let added = post(
        &app,
        "/api/notes/bulk/tags",
        json!({ "note_ids": [a, b], "add_tag_ids": [tag] }),
    )
    .await;
    assert_eq!(added.ok(), json!({ "affected": 2 }));
    let again = post(
        &app,
        "/api/notes/bulk/tags",
        json!({ "note_ids": [a], "add_tag_ids": [tag] }),
    )
    .await;
    assert_eq!(again.ok(), json!({ "affected": 1 }));
    let tag_names = names(&fetch(&app, a).await.ok()["tags"]);
    assert_eq!(tag_names.iter().filter(|n| *n == "rust").count(), 1);
    let removed = post(
        &app,
        "/api/notes/bulk/tags",
        json!({ "note_ids": [a], "remove_tag_ids": [tag] }),
    )
    .await;
    assert_eq!(removed.ok(), json!({ "affected": 1 }));
    assert!(!names(&fetch(&app, a).await.ok()["tags"]).contains(&"rust".to_string()));
    assert!(names(&fetch(&app, b).await.ok()["tags"]).contains(&"rust".to_string()));
}

#[tokio::test]
async fn bulk_tags_rejects_difficulty_tags() {
    let app = TestApp::new().await;
    let (a, _) = two(&app).await;
    let hard = app.tag_id("Hard").await;
    let response = post(
        &app,
        "/api/notes/bulk/tags",
        json!({ "note_ids": [a], "add_tag_ids": [hard] }),
    )
    .await;
    assert_eq!(response.code(), 400);
}

#[tokio::test]
async fn bulk_set_difficulty_swaps_the_tag_and_ease_factor() {
    let app = TestApp::new().await;
    let (a, b) = two(&app).await;
    let result = post(
        &app,
        "/api/notes/bulk/difficulty",
        json!({ "note_ids": [a, b], "difficulty": "easy" }),
    )
    .await;
    assert_eq!(result.ok(), json!({ "affected": 2 }));
    for note in [a, b] {
        let note = fetch(&app, note).await.ok();
        let difficulty: Vec<&Value> = note["tags"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|t| t["is_difficulty"] == true)
            .map(|t| &t["name"])
            .collect();
        assert_eq!(difficulty, [&json!("Easy")]);
        assert_eq!(note["ease_factor"], 2.8);
    }
}

#[tokio::test]
async fn bulk_reschedule_moves_pending_reminders_and_skips_trashed_notes() {
    let app = TestApp::new().await;
    let (a, b) = two(&app).await;
    let new_time = now() + days(10);
    let result = post(
        &app,
        "/api/notes/bulk/reschedule",
        json!({ "note_ids": [a, b], "remind_at": iso(new_time) }),
    )
    .await;
    assert_eq!(result.ok(), json!({ "affected": 2 }));
    for note in [a, b] {
        let remind_at = at(&fetch(&app, note).await.ok()["reminders"][0]["remind_at"]);
        assert!((remind_at - new_time).num_milliseconds().abs() < 1000);
    }
    app.delete(&format!("/api/notes/{a}")).send().await;
    let skipped = post(
        &app,
        "/api/notes/bulk/reschedule",
        json!({ "note_ids": [a], "remind_at": iso(new_time) }),
    )
    .await;
    assert_eq!(skipped.ok(), json!({ "affected": 0 }));
}

#[tokio::test]
async fn projects_are_unique_case_insensitively_and_blank_names_400() {
    let app = TestApp::new().await;
    let first = app.project("Reading").await;
    assert_eq!(first["name"], "Reading");
    let second = app.project("  reading  ").await;
    assert_eq!(second["id"], first["id"]);
    let list = app.get("/api/projects/list").send().await.ok();
    assert_eq!(list.as_array().unwrap().len(), 1);
    let blank = post(&app, "/api/projects/create", json!({ "name": "   " })).await;
    assert_eq!(blank.code(), 400);
}

#[tokio::test]
async fn project_list_reports_only_live_note_counts() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    app.note(json!({ "project_id": id(&project) })).await;
    let trashed = app.note(json!({ "project_id": id(&project) })).await;
    app.delete(&format!("/api/notes/{}", id(&trashed)))
        .send()
        .await;
    let list = app.get("/api/projects/list").send().await.ok();
    assert_eq!(list[0]["note_count"], 1);
}

#[tokio::test]
async fn deleting_a_project_keeps_or_trashes_its_notes() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    let note = app.note(json!({ "project_id": id(&project) })).await;
    let kept = app
        .delete(&format!("/api/projects/{}", id(&project)))
        .send()
        .await
        .ok();
    assert_eq!(
        kept,
        json!({ "notes_trashed": 0, "notes_kept": 1, "tags_deleted": 0 })
    );
    assert!(fetch(&app, id(&note)).await.ok()["project"].is_null());

    let project = app.project("Q").await;
    let note = app.note(json!({ "project_id": id(&project) })).await;
    let trashed = app
        .delete(&format!("/api/projects/{}?delete_notes=true", id(&project)))
        .send()
        .await
        .ok();
    assert_eq!(
        trashed,
        json!({ "notes_trashed": 1, "notes_kept": 0, "tags_deleted": 0 })
    );
    assert_eq!(fetch(&app, id(&note)).await.code(), 404);
    assert_eq!(app.delete("/api/projects/999").send().await.code(), 404);
}

#[tokio::test]
async fn deleting_a_project_with_notes_can_also_delete_their_orphan_tags() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    let only_here = id(&app.tag("only-here").await);
    let elsewhere = id(&app.tag("elsewhere").await);
    app.note(json!({ "project_id": id(&project), "tag_ids": [only_here, elsewhere] }))
        .await;
    app.note(json!({ "name": "outside", "tag_ids": [elsewhere] }))
        .await;
    let result = app
        .delete(&format!(
            "/api/projects/{}?delete_notes=true&delete_orphan_tags=true",
            id(&project)
        ))
        .send()
        .await
        .ok();
    assert_eq!(result["tags_deleted"], 1);
    let tags = names(&app.get("/api/tags/list").send().await.ok());
    assert!(!tags.contains(&"only-here".to_string()));
    assert!(tags.contains(&"elsewhere".to_string()));
}

#[tokio::test]
async fn tags_are_unique_case_insensitively_and_blank_names_400() {
    let app = TestApp::new().await;
    let first = app.tag("rust").await;
    assert_eq!(first["name"], "rust");
    assert_eq!(first["is_difficulty"], false);
    assert_eq!(app.tag("Rust").await["id"], first["id"]);
    let blank = post(&app, "/api/tags/create", json!({ "name": "" })).await;
    assert_eq!(blank.code(), 400);
}

#[tokio::test]
async fn tag_list_includes_the_seeded_difficulty_tags() {
    let app = TestApp::new().await;
    let tags = app.get("/api/tags/list").send().await.ok();
    for name in ["Easy", "Medium", "Hard"] {
        assert!(
            tags.as_array()
                .unwrap()
                .iter()
                .any(|t| t["name"] == name && t["is_difficulty"] == true)
        );
    }
}

#[tokio::test]
async fn deleting_a_tag_keeps_or_trashes_its_notes() {
    let app = TestApp::new().await;
    let tag = app.tag("rust").await;
    let note = app.note(json!({ "tag_ids": [id(&tag)] })).await;
    let kept = app
        .delete(&format!("/api/tags/{}", id(&tag)))
        .send()
        .await
        .ok();
    assert_eq!(
        kept,
        json!({ "notes_trashed": 0, "notes_kept": 1, "tags_deleted": 0 })
    );
    assert!(!names(&fetch(&app, id(&note)).await.ok()["tags"]).contains(&"rust".to_string()));

    let tag = app.tag("go").await;
    let note = app.note(json!({ "tag_ids": [id(&tag)] })).await;
    let trashed = app
        .delete(&format!("/api/tags/{}?delete_notes=true", id(&tag)))
        .send()
        .await
        .ok();
    assert_eq!(trashed["notes_trashed"], 1);
    assert_eq!(fetch(&app, id(&note)).await.code(), 404);
}

#[tokio::test]
async fn difficulty_and_missing_tags_cannot_be_deleted() {
    let app = TestApp::new().await;
    let medium = app.tag_id("Medium").await;
    assert_eq!(
        app.delete(&format!("/api/tags/{medium}"))
            .send()
            .await
            .code(),
        400
    );
    assert_eq!(app.delete("/api/tags/999").send().await.code(), 404);
}

#[tokio::test]
async fn delete_unused_tags_removes_only_tags_no_live_note_carries() {
    let app = TestApp::new().await;
    app.tag("unused").await;
    let used = app.tag("used").await;
    app.note(json!({ "tag_ids": [id(&used)] })).await;
    let result = app.delete("/api/tags/unused").send().await.ok();
    assert_eq!(result["tags_deleted"], 1);
    let tags = names(&app.get("/api/tags/list").send().await.ok());
    assert!(!tags.contains(&"unused".to_string()));
    for name in ["used", "Easy", "Medium", "Hard"] {
        assert!(tags.contains(&name.to_string()));
    }
}
