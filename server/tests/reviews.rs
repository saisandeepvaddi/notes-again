mod common;

use common::*;

async fn act(app: &TestApp, reminder: &serde_json::Value, body: serde_json::Value) -> Res {
    app.patch(&format!("/api/notes/reminders/{}/now", id(reminder)))
        .json(body)
        .send()
        .await
}

#[tokio::test]
async fn reviewing_records_the_rating_and_schedules_the_next_reminder() {
    let app = TestApp::new().await;
    app.use_sm2().await;
    let note = app.named("n").await;
    let first = pending(&note);
    let updated = act(
        &app,
        &first,
        json!({ "action": "review", "rating": "good" }),
    )
    .await
    .ok();
    let reviewed = updated["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == first["id"])
        .unwrap()
        .clone();
    assert_eq!(reviewed["rating"], "good");
    assert!(!reviewed["reviewed_at"].is_null());
    assert!(pending_at(&updated) > now());
}

#[tokio::test]
async fn reviewing_an_fsrs_note_also_schedules_a_next_reminder() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    assert_eq!(note["algorithm"], "fsrs");
    let updated = app.review(&note, "good").await;
    assert!(pending_at(&updated) > now());
}

#[tokio::test]
async fn review_without_a_rating_400s() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let response = act(&app, &pending(&note), json!({ "action": "review" })).await;
    assert_eq!(response.code(), 400);
}

#[tokio::test]
async fn reviewing_a_missing_reminder_404s() {
    let app = TestApp::new().await;
    let response = act(
        &app,
        &json!({ "id": 999 }),
        json!({ "action": "review", "rating": "good" }),
    )
    .await;
    assert_eq!(response.code(), 404);
}

#[tokio::test]
async fn undo_review_restores_the_note_and_drops_the_new_reminder() {
    let app = TestApp::new().await;
    app.use_sm2().await;
    let note = app.named("n").await;
    let first = pending(&note);
    let reviewed = app.review(&note, "good").await;
    assert_eq!(reviewed["interval_days"], 1);
    let body = act(&app, &first, json!({ "action": "undo_review" }))
        .await
        .ok();
    assert_eq!(body["interval_days"], 0);
    assert_eq!(body["reminders"].as_array().unwrap().len(), 1);
    assert_eq!(body["reminders"][0]["id"], first["id"]);
    assert!(body["reminders"][0]["reviewed_at"].is_null());
}

#[tokio::test]
async fn undoing_an_unreviewed_reminder_400s() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let response = act(&app, &pending(&note), json!({ "action": "undo_review" })).await;
    assert_eq!(response.code(), 400);
}

#[tokio::test]
async fn only_the_most_recent_review_can_be_undone() {
    let app = TestApp::new().await;
    app.use_sm2().await;
    let note = app.named("n").await;
    let first = pending(&note);
    let once = app.review(&note, "good").await;
    app.review(&once, "good").await;
    let stale = act(&app, &first, json!({ "action": "undo_review" })).await;
    assert_eq!(stale.code(), 400);
}

#[tokio::test]
async fn sm2_interval_preview_does_not_change_the_note_or_reminders() {
    let app = TestApp::new().await;
    app.use_sm2().await;
    let note = app
        .note(json!({ "first_reminder_at": "1970-01-01T00:00:00Z" }))
        .await;
    let intervals = app
        .get(&format!("/api/notes/{}/intervals", id(&note)))
        .send()
        .await
        .ok();
    let keys: Vec<&String> = intervals.as_object().unwrap().keys().collect();
    assert_eq!(sorted(keys), ["again", "easy", "good", "hard"]);
    let times: Vec<_> = intervals.as_object().unwrap().values().map(at).collect();
    let spread = *times.iter().max().unwrap() - *times.iter().min().unwrap();
    assert!(spread.num_milliseconds() < 1000);
    let after = app
        .get(&format!("/api/notes/{}", id(&note)))
        .send()
        .await
        .ok();
    assert_eq!(after["interval_days"], note["interval_days"]);
    assert_eq!(after["ease_factor"], note["ease_factor"]);
    assert_eq!(after["reminders"], note["reminders"]);
}

#[tokio::test]
async fn fsrs_interval_preview_does_not_change_the_note_or_reminders() {
    let app = TestApp::new().await;
    let note = app
        .note(json!({ "first_reminder_at": "1970-01-01T00:00:00Z" }))
        .await;
    let intervals = app
        .get(&format!("/api/notes/{}/intervals", id(&note)))
        .send()
        .await
        .ok();
    assert_eq!(intervals.as_object().unwrap().len(), 4);
    assert!(at(&intervals["again"]) < at(&intervals["easy"]));
    let after = app
        .get(&format!("/api/notes/{}", id(&note)))
        .send()
        .await
        .ok();
    assert_eq!(after["algorithm"], note["algorithm"]);
    assert_eq!(after["reminders"], note["reminders"]);
}

#[tokio::test]
async fn interval_preview_rejects_notes_not_in_review_and_missing_notes() {
    let app = TestApp::new().await;
    let note = app.note(json!({ "in_review": false })).await;
    let response = app
        .get(&format!("/api/notes/{}/intervals", id(&note)))
        .send()
        .await;
    assert_eq!(response.code(), 400);
    assert_eq!(app.get("/api/notes/999/intervals").send().await.code(), 404);
}
