mod common;

use common::*;
use serde_json::Value;

async fn set_status(app: &TestApp, note: &Value, status: &str) -> Value {
    app.patch(&format!("/api/notes/{}/status", id(note)))
        .json(json!({ "status": status }))
        .send()
        .await
        .ok()
}

async fn set_paused(app: &TestApp, note: &Value, paused: bool) -> Value {
    app.patch(&format!("/api/notes/{}/paused", id(note)))
        .json(json!({ "paused": paused }))
        .send()
        .await
        .ok()
}

fn unreviewed(note: &Value) -> usize {
    note["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["reviewed_at"].is_null())
        .count()
}

async fn post(app: &TestApp, path: &str, body: Value) -> Value {
    app.post(path).json(body).send().await.ok()
}

#[tokio::test]
async fn a_paused_note_is_left_out_of_review_and_comes_back_on_resume() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    assert!(note["paused_at"].is_null());
    let paused = set_paused(&app, &note, true).await;
    assert!(!paused["paused_at"].is_null());
    assert!(!app.due_ids().await.contains(&id(&note)));
    assert_eq!(
        app.get(&format!("/api/notes/{}", id(&note)))
            .send()
            .await
            .code(),
        200
    );
    let resumed = set_paused(&app, &note, false).await;
    assert!(resumed["paused_at"].is_null());
    assert_eq!(pending_at(&resumed), pending_at(&note));
    assert!(app.due_ids().await.contains(&id(&note)));
}

#[tokio::test]
async fn list_filters_by_paused_and_the_day_view_skips_paused_notes() {
    let app = TestApp::new().await;
    let active = app.named("active").await;
    let paused = app.note(json!({ "name": "paused", "paused": true })).await;
    assert_eq!(app.listed("").await, sorted(vec![id(&active), id(&paused)]));
    assert_eq!(app.listed("paused=true").await, [id(&paused)]);
    assert_eq!(app.listed("paused=false").await, [id(&active)]);
    let query = format!(
        "start={}&end={}",
        enc(&iso(now() - chrono::Duration::hours(1))),
        enc(&iso(now() + chrono::Duration::hours(1)))
    );
    assert_eq!(app.listed(&query).await, [id(&active)]);
}

#[tokio::test]
async fn new_notes_follow_the_projects_default_unless_told_otherwise() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    app.post(&format!("/api/projects/{}/pause", id(&project)))
        .send()
        .await
        .ok();
    let pid = id(&project);
    assert!(!app.note(json!({ "project_id": pid })).await["paused_at"].is_null());
    assert!(
        app.note(json!({ "project_id": pid, "paused": false }))
            .await["paused_at"]
            .is_null()
    );
    assert!(!app.note(json!({ "paused": true })).await["paused_at"].is_null());
    assert!(app.note(json!({})).await["paused_at"].is_null());
}

#[tokio::test]
async fn pausing_a_project_pauses_its_notes_and_sets_its_default() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    let inside = app.note(json!({ "project_id": id(&project) })).await;
    let outside = app.named("out").await;
    assert_eq!(
        app.post(&format!("/api/projects/{}/pause", id(&project)))
            .send()
            .await
            .ok(),
        json!({ "affected": 1 })
    );
    assert_eq!(app.due_ids().await, [id(&outside)]);
    let listed = app.get("/api/projects/list").send().await.ok();
    assert_eq!(listed[0]["paused"], true);
    assert_eq!(listed[0]["paused_count"], 1);
    let result = post(
        &app,
        &format!("/api/projects/{}/resume", id(&project)),
        json!({ "per_day": 0 }),
    )
    .await;
    assert_eq!(result["affected"], 1);
    assert_eq!(app.due_ids().await, sorted(vec![id(&inside), id(&outside)]));
    let listed = app.get("/api/projects/list").send().await.ok();
    assert_eq!(listed[0]["paused"], false);
    assert_eq!(listed[0]["paused_count"], 0);
}

#[tokio::test]
async fn pausing_a_tag_pauses_the_notes_carrying_it() {
    let app = TestApp::new().await;
    let tag = app.tag("ref").await;
    let tagged = app.note(json!({ "tag_ids": [id(&tag)] })).await;
    let other = app.named("o").await;
    assert_eq!(
        app.post(&format!("/api/tags/{}/pause", id(&tag)))
            .send()
            .await
            .ok(),
        json!({ "affected": 1 })
    );
    assert_eq!(app.due_ids().await, [id(&other)]);
    let tags = app.get("/api/tags/list").send().await.ok();
    let ref_tag = tags
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "ref")
        .unwrap()
        .clone();
    assert_eq!(ref_tag["paused_count"], 1);
    post(
        &app,
        &format!("/api/tags/{}/resume", id(&tag)),
        json!({ "per_day": 0 }),
    )
    .await;
    assert_eq!(app.due_ids().await, sorted(vec![id(&tagged), id(&other)]));
}

#[tokio::test]
async fn unknown_project_or_tag_404s() {
    let app = TestApp::new().await;
    assert_eq!(app.post("/api/projects/999/pause").send().await.code(), 404);
    assert_eq!(
        app.post("/api/tags/999/resume")
            .json(json!({}))
            .send()
            .await
            .code(),
        404
    );
}

#[tokio::test]
async fn bulk_pause_and_resume() {
    let app = TestApp::new().await;
    let (a, b) = (app.named("a").await, app.named("b").await);
    assert_eq!(
        post(
            &app,
            "/api/notes/bulk/pause",
            json!({ "note_ids": [id(&a), id(&b), 999] })
        )
        .await,
        json!({ "affected": 2 })
    );
    assert!(app.due_ids().await.is_empty());
    assert_eq!(
        post(
            &app,
            "/api/notes/bulk/pause",
            json!({ "note_ids": [id(&a)] })
        )
        .await,
        json!({ "affected": 0 })
    );
    let result = post(
        &app,
        "/api/notes/bulk/resume",
        json!({ "note_ids": [id(&a)], "per_day": 0 }),
    )
    .await;
    assert_eq!(
        result,
        json!({ "affected": 1, "due_today": 1, "days_span": 0 })
    );
    assert_eq!(app.due_ids().await, [id(&a)]);
}

#[tokio::test]
async fn resume_paces_never_reviewed_due_notes_per_day() {
    let app = TestApp::new().await;
    let mut ids = vec![];
    for i in 0..5 {
        ids.push(id(&app
            .note(json!({ "name": format!("n{i}"), "paused": true }))
            .await));
    }
    let result = post(
        &app,
        "/api/notes/bulk/resume",
        json!({ "note_ids": ids, "per_day": 2 }),
    )
    .await;
    assert_eq!(
        result,
        json!({ "affected": 5, "due_today": 2, "days_span": 3 })
    );
    assert_eq!(app.due_ids().await, sorted(ids[..2].to_vec()));
}

#[tokio::test]
async fn resume_keeps_the_schedule_of_notes_with_review_history() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let reviewed = app.review(&note, "good").await;
    post(
        &app,
        "/api/notes/bulk/pause",
        json!({ "note_ids": [id(&note)] }),
    )
    .await;
    let result = post(
        &app,
        "/api/notes/bulk/resume",
        json!({ "note_ids": [id(&note)], "per_day": 1 }),
    )
    .await;
    assert_eq!(
        result,
        json!({ "affected": 1, "due_today": 0, "days_span": 0 })
    );
    let after = app
        .get(&format!("/api/notes/{}", id(&note)))
        .send()
        .await
        .ok();
    assert_eq!(pending_at(&after), pending_at(&reviewed));
}

#[tokio::test]
async fn a_paused_import_creates_paused_notes_and_paused_new_decks() {
    let app = TestApp::new().await;
    let notes: Vec<Value> = (0..3)
        .map(|i| json!({ "name": format!("n{i}"), "content": "c" }))
        .collect();
    let result = post(
        &app,
        "/api/import/notes",
        json!({ "payload": { "decks": [{ "name": "Later", "notes": notes }] }, "paused": true, "per_day": 1 }),
    )
    .await;
    assert_eq!(result["notes_created"], 3);
    assert_eq!(result["paused"], true);
    assert_eq!(result["due_today"], 0);
    assert!(app.due_ids().await.is_empty());
    let decks = app.get("/api/projects/list").send().await.ok();
    assert_eq!(decks[0]["paused"], true);
    assert_eq!(decks[0]["paused_count"], 3);
}

#[tokio::test]
async fn a_note_only_note_has_no_schedule_and_is_never_due() {
    let app = TestApp::new().await;
    let note = app.note(json!({ "in_review": false })).await;
    assert_eq!(note["in_review"], false);
    assert!(note["paused_at"].is_null());
    assert_eq!(note["reminders"], json!([]));
    assert!(!app.due_ids().await.contains(&id(&note)));
}

#[tokio::test]
async fn note_only_ignores_paused_and_the_projects_paused_default() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    app.post(&format!("/api/projects/{}/pause", id(&project)))
        .send()
        .await
        .ok();
    let note = app
        .note(json!({ "project_id": id(&project), "paused": true, "in_review": false }))
        .await;
    assert_eq!(note["in_review"], false);
    assert!(note["paused_at"].is_null());
}

#[tokio::test]
async fn status_filter_separates_active_paused_and_note_only() {
    let app = TestApp::new().await;
    let active = app.named("active").await;
    let paused = app.note(json!({ "paused": true })).await;
    let note_only = app.note(json!({ "in_review": false })).await;
    assert_eq!(
        app.listed("").await,
        sorted(vec![id(&active), id(&paused), id(&note_only)])
    );
    assert_eq!(app.listed("status=active").await, [id(&active)]);
    assert_eq!(app.listed("status=paused").await, [id(&paused)]);
    assert_eq!(app.listed("status=note-only").await, [id(&note_only)]);
}

#[tokio::test]
async fn converting_between_all_three_states() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let paused = set_status(&app, &note, "paused").await;
    assert!(!paused["paused_at"].is_null());
    let note_only = set_status(&app, &paused, "note-only").await;
    assert_eq!(note_only["in_review"], false);
    assert!(note_only["paused_at"].is_null());
    assert_eq!(unreviewed(&note_only), 0);
    let back = set_status(&app, &note_only, "paused").await;
    assert_eq!(back["in_review"], true);
    assert!(!back["paused_at"].is_null());
    assert_eq!(unreviewed(&back), 1);
    assert!(!app.due_ids().await.contains(&id(&note)));
    let active = set_status(&app, &back, "active").await;
    assert!(active["paused_at"].is_null());
    assert!(app.due_ids().await.contains(&id(&note)));
}

#[tokio::test]
async fn removing_from_review_keeps_history_and_adding_back_continues_from_it() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let reviewed = app.review(&note, "good").await;
    assert_eq!(reviewed["reminders"].as_array().unwrap().len(), 2);
    let note_only = set_status(&app, &reviewed, "note-only").await;
    let ratings: Vec<&Value> = note_only["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| &r["rating"])
        .collect();
    assert_eq!(ratings, [&json!("good")]);
    let back = set_status(&app, &note_only, "active").await;
    assert_eq!(back["reminders"].as_array().unwrap().len(), 2);
    assert!(pending_at(&back) < pending_at(&reviewed));
    assert!(app.due_ids().await.contains(&id(&note)));
}

#[tokio::test]
async fn a_note_only_note_cannot_be_reviewed_or_have_its_review_undone() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let past = pending(&note);
    let reviewed = app.review(&note, "good").await;
    set_status(&app, &reviewed, "note-only").await;
    let path = format!("/api/notes/reminders/{}/now", id(&past));
    let undo = app
        .patch(&path)
        .json(json!({ "action": "undo_review" }))
        .send()
        .await;
    assert_eq!(undo.code(), 400);
    let again = app
        .patch(&path)
        .json(json!({ "action": "review", "rating": "good" }))
        .send()
        .await;
    assert_eq!(again.code(), 400);
}

#[tokio::test]
async fn pausing_skips_note_only_notes_in_bulk_but_not_individually() {
    let app = TestApp::new().await;
    let note = app.note(json!({ "in_review": false })).await;
    assert_eq!(
        post(
            &app,
            "/api/notes/bulk/pause",
            json!({ "note_ids": [id(&note)] })
        )
        .await,
        json!({ "affected": 0 })
    );
    let paused = set_paused(&app, &note, true).await;
    assert_eq!(paused["in_review"], true);
    assert!(!paused["paused_at"].is_null());
}

#[tokio::test]
async fn bulk_remove_and_add_back_paced_per_day() {
    let app = TestApp::new().await;
    let mut ids = vec![];
    for i in 0..5 {
        ids.push(id(&app.named(&format!("n{i}")).await));
    }
    assert_eq!(
        post(
            &app,
            "/api/notes/bulk/remove-from-review",
            json!({ "note_ids": ids })
        )
        .await,
        json!({ "affected": 5 })
    );
    assert!(app.due_ids().await.is_empty());
    let result = post(
        &app,
        "/api/notes/bulk/add-to-review",
        json!({ "note_ids": ids, "per_day": 2 }),
    )
    .await;
    assert_eq!(
        result,
        json!({ "affected": 5, "due_today": 2, "days_span": 3 })
    );
    assert_eq!(app.due_ids().await, sorted(ids[..2].to_vec()));
}

#[tokio::test]
async fn bulk_add_to_review_as_paused() {
    let app = TestApp::new().await;
    let a = id(&app.note(json!({ "in_review": false })).await);
    let b = id(&app.note(json!({ "in_review": false })).await);
    let result = post(
        &app,
        "/api/notes/bulk/add-to-review",
        json!({ "note_ids": [a, b], "paused": true, "per_day": 1 }),
    )
    .await;
    assert_eq!(
        result,
        json!({ "affected": 2, "due_today": 0, "days_span": 0 })
    );
    assert_eq!(app.listed("status=paused").await, sorted(vec![a, b]));
}

#[tokio::test]
async fn project_and_tag_counts_and_conversions() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    let tag = app.tag("ref").await;
    let a = app
        .note(json!({ "project_id": id(&project), "tag_ids": [id(&tag)] }))
        .await;
    app.note(json!({ "project_id": id(&project), "in_review": false }))
        .await;
    let listed = app.get("/api/projects/list").send().await.ok();
    assert_eq!(listed[0]["note_only_count"], 1);
    assert_eq!(
        app.post(&format!("/api/tags/{}/remove-from-review", id(&tag)))
            .send()
            .await
            .ok(),
        json!({ "affected": 1 })
    );
    let tags = app.get("/api/tags/list").send().await.ok();
    let ref_tag = tags
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "ref")
        .unwrap()
        .clone();
    assert_eq!(ref_tag["note_only_count"], 1);
    let result = post(
        &app,
        &format!("/api/projects/{}/add-to-review", id(&project)),
        json!({ "per_day": 0 }),
    )
    .await;
    assert_eq!(result["affected"], 2);
    assert!(app.due_ids().await.contains(&id(&a)));
    let listed = app.get("/api/projects/list").send().await.ok();
    assert_eq!(listed[0]["note_only_count"], 0);
    assert_eq!(
        app.post(&format!(
            "/api/projects/{}/remove-from-review",
            id(&project)
        ))
        .send()
        .await
        .ok(),
        json!({ "affected": 2 })
    );
}

#[tokio::test]
async fn a_note_only_import_creates_unscheduled_notes() {
    let app = TestApp::new().await;
    let notes: Vec<Value> = (0..3).map(|i| json!({ "name": format!("n{i}") })).collect();
    let result = post(
        &app,
        "/api/import/notes",
        json!({ "payload": { "decks": [{ "name": "Ref", "notes": notes }] }, "in_review": false, "paused": true }),
    )
    .await;
    assert_eq!(result["notes_created"], 3);
    assert_eq!(result["note_only"], true);
    assert_eq!(result["paused"], false);
    assert!(result["first_due"].is_null());
    assert_eq!(result["due_today"], 0);
    let decks = app.get("/api/projects/list").send().await.ok();
    assert_eq!(decks[0]["paused"], false);
    assert_eq!(decks[0]["note_only_count"], 3);
}

#[tokio::test]
async fn note_only_survives_an_export_and_import_round_trip() {
    let app = TestApp::new().await;
    let note = app.named("kept").await;
    let reviewed = app.review(&note, "good").await;
    set_status(&app, &reviewed, "note-only").await;
    app.named("studied").await;
    let mut exported = post(&app, "/api/export/notes", json!({})).await;
    let kept = exported["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["name"] == "kept")
        .unwrap()
        .clone();
    assert_eq!(kept["review"]["in_review"], false);
    assert!(kept["review"]["due_at"].is_null());
    for item in exported["notes"].as_array_mut().unwrap() {
        let name = format!("{} copy", item["name"].as_str().unwrap());
        item["name"] = json!(name);
    }
    let result = post(&app, "/api/import/notes", json!({ "payload": exported })).await;
    assert_eq!(result["notes_created"], 2);
    let found = app
        .get("/api/notes/list?status=note-only&search=kept%20copy")
        .send()
        .await
        .ok();
    let items = found["items"].as_array().unwrap();
    assert_eq!(items.len(), 1);
    let ratings: Vec<&Value> = items[0]["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| &r["rating"])
        .collect();
    assert_eq!(ratings, [&json!("good")]);
}
