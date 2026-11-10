mod common;

use common::*;
use serde_json::{Value, json};

fn body(overrides: Value) -> Value {
    let mut base = json!({
        "provider": "openai",
        "model": "gpt-test",
        "api_key": "sk-test-key",
        "question": "What is this?",
        "history": []
    });
    for (key, value) in overrides.as_object().unwrap() {
        base[key] = value.clone();
    }
    base
}

async fn discuss(app: &TestApp, note: i64, payload: Value) -> Res {
    app.post(&format!("/api/notes/{note}/discuss"))
        .json(payload)
        .send()
        .await
}

#[tokio::test]
async fn rejects_invalid_requests_before_any_provider_call() {
    let app = TestApp::new().await;
    let note = id(&app.named("n").await);
    let long_question = "q".repeat(2_001);
    let big_history = json!([{"role": "user", "content": "x".repeat(8_001)}]);
    let many = json!(
        (0..7)
            .map(|_| json!({"role": "user", "content": "a"}))
            .collect::<Vec<_>>()
    );
    for payload in [
        body(json!({"api_key": "  "})),
        body(json!({"api_key": "bad key"})),
        body(json!({"api_key": "k".repeat(513)})),
        body(json!({"model": ""})),
        body(json!({"model": "bad model!"})),
        body(json!({"question": "   "})),
        body(json!({"question": long_question})),
        body(json!({"history": big_history})),
        body(json!({"history": many})),
    ] {
        assert_eq!(discuss(&app, note, payload).await.code(), 400);
    }
    assert_eq!(
        discuss(&app, note, body(json!({"provider": "other"})))
            .await
            .code(),
        422
    );
}

#[tokio::test]
async fn missing_and_trashed_notes_are_not_discussable() {
    let app = TestApp::new().await;
    assert_eq!(discuss(&app, 9999, body(json!({}))).await.code(), 404);
    let note = id(&app.named("gone").await);
    assert_eq!(
        app.delete(&format!("/api/notes/{note}"))
            .send()
            .await
            .code(),
        204
    );
    assert_eq!(discuss(&app, note, body(json!({}))).await.code(), 404);
}

#[tokio::test]
async fn invalid_requests_leave_the_note_and_schedule_untouched() {
    let app = TestApp::new().await;
    let note = app.named("keep").await;
    let before = app
        .get(&format!("/api/notes/{}", id(&note)))
        .send()
        .await
        .ok();
    discuss(&app, id(&note), body(json!({"question": ""}))).await;
    let after = app
        .get(&format!("/api/notes/{}", id(&note)))
        .send()
        .await
        .ok();
    assert_eq!(before, after);
}

#[tokio::test]
async fn requires_authentication() {
    let app = TestApp::with(|config| {
        config.auth_mode = notes_again_server::config::AuthMode::Local;
    })
    .await;
    let response = app
        .post("/api/notes/1/discuss")
        .without_cookies()
        .json(body(json!({})))
        .send()
        .await;
    assert!(matches!(response.code(), 401 | 403));
}
