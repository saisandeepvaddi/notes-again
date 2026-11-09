mod common;

use std::time::{Duration, Instant};

use common::*;
use notes_again_server::config::AuthMode;
use notes_again_server::sync::client::{Remote, sync_once};
use serde_json::Value;

const NOTES: usize = 10_000;

async fn timed(app: &TestApp, path: &str) -> Duration {
    let started = Instant::now();
    let response = app.get(path).send().await;
    assert_eq!(response.code(), 200, "{path}: {}", response.text());
    started.elapsed()
}

fn library() -> Value {
    let decks: Vec<Value> = (0..20)
        .map(|deck| {
            let notes: Vec<Value> = (0..NOTES / 20)
                .map(|i| {
                    json!({
                        "name": format!("Deck {deck} note {i} about ownership and borrowing"),
                        "content": format!("## Heading {i}\n\nSome body text for note {i} in deck {deck}, with `code` and a [link](https://example.com/{i}).\n\n- one\n- two\n"),
                        "tags": [format!("tag-{}", i % 50)],
                    })
                })
                .collect();
            json!({ "name": format!("Deck {deck}"), "notes": notes })
        })
        .collect();
    json!({ "decks": decks })
}

#[tokio::test]
#[ignore = "performance budget; run with cargo test --release --test perf -- --ignored --nocapture"]
async fn ten_thousand_notes_stay_fast() {
    let server = TestApp::new().await;
    let started = Instant::now();
    let imported = server
        .post("/api/import/notes")
        .json(json!({ "payload": library(), "per_day": 0 }))
        .send()
        .await
        .ok();
    assert_eq!(imported["notes_created"], NOTES);
    println!("import {NOTES} notes: {:?}", started.elapsed());

    let budgets = [
        ("/api/notes/list?limit=50", 150),
        ("/api/notes/list?limit=50&sort=name&order=asc", 150),
        ("/api/notes/list?limit=50&sort=difficulty&order=desc", 150),
        ("/api/notes/list?limit=50&tag_id=10", 150),
        ("/api/notes/due?limit=50", 150),
        ("/api/notes/ids", 150),
        ("/api/notes/list?limit=50&search=borrowing", 250),
        ("/api/search?q=note%20123", 250),
        ("/api/projects/list", 100),
        ("/api/tags/list", 100),
    ];
    let mut over = vec![];
    for (path, budget_ms) in budgets {
        timed(&server, path).await;
        let took = timed(&server, path).await;
        println!("{path}: {took:?} (budget {budget_ms} ms)");
        if took > Duration::from_millis(budget_ms) {
            over.push(format!("{path} took {took:?}"));
        }
    }

    let served = server.serve().await;
    let desktop = TestApp::with(|c| {
        c.auth_mode = AuthMode::Desktop;
        c.desktop_secret = Some("perf".into());
    })
    .await;
    let started = Instant::now();
    let outcome = sync_once(&desktop.state, &{
        sqlx::query(
            "INSERT INTO sync_remote (id, url, token, pushed_version, pulled_version, created_at) VALUES (1, ?, 'unused', 0, 0, ?)",
        )
        .bind(&served.url)
        .bind(notes_again_server::time::Ts::now())
        .execute(&desktop.state.db)
        .await
        .unwrap();
        Remote::new(&served.url, Some("unused"))
    })
    .await
    .unwrap();
    let took = started.elapsed();
    println!(
        "first sync pulling {} rows: {took:?} (budget 10 s)",
        outcome.pulled
    );
    assert!(outcome.pulled >= NOTES);
    if took > Duration::from_secs(10) {
        over.push(format!("first sync took {took:?}"));
    }
    let version: i64 = sqlx::query_scalar("SELECT version FROM sync_state WHERE id = 1")
        .fetch_one(&server.state.db)
        .await
        .unwrap();
    let took = timed(&server, &format!("/api/sync/pull?since={version}")).await;
    println!("server pull with nothing new: {took:?} (budget 50 ms)");
    if took > Duration::from_millis(50) {
        over.push(format!("empty pull took {took:?}"));
    }
    let mut idle = Duration::ZERO;
    for round in 0..3 {
        let started = Instant::now();
        let outcome = sync_once(&desktop.state, &Remote::new(&served.url, Some("unused")))
            .await
            .unwrap();
        assert_eq!((outcome.pushed, outcome.pulled), (0, 0));
        idle = started.elapsed();
        println!("idle sync {round}: {idle:?}");
    }
    if idle > Duration::from_millis(100) {
        over.push(format!("steady idle sync took {idle:?}"));
    }

    assert!(over.is_empty(), "over budget: {over:#?}");
}
