mod common;

use std::collections::BTreeSet;
use std::path::Path;
use std::time::{Duration, SystemTime};

use common::*;
use notes_again_server::backups::{
    create_snapshot, list_snapshots, restore_database, snapshot_due,
};
use serde_json::Value;

async fn create(app: &TestApp, name: &str, extra: Value) -> Value {
    let mut body = extra;
    body["name"] = json!(name);
    body["content"] = json!("body");
    app.note(body).await
}

async fn export(app: &TestApp, options: Value) -> Value {
    app.post("/api/export/notes")
        .json(options)
        .send()
        .await
        .ok()
}

async fn import(app: &TestApp, body: Value) -> Value {
    app.post("/api/import/notes").json(body).send().await.ok()
}

fn exported_names(data: &Value) -> BTreeSet<String> {
    let mut all = BTreeSet::new();
    for deck in data["decks"].as_array().unwrap() {
        all.extend(names(&deck["notes"]));
    }
    all.extend(names(&data["notes"]));
    all
}

fn set(items: &[&str]) -> BTreeSet<String> {
    items.iter().map(|s| s.to_string()).collect()
}

async fn seed_library(app: &TestApp) {
    let project = app.project("Leetcode").await;
    let tag = app.tag("dsa").await;
    let note = create(
        app,
        "Two sum",
        json!({ "project_id": id(&project), "tag_ids": [id(&tag)], "difficulty": "hard" }),
    )
    .await;
    let note = app.review(&note, "good").await;
    app.review(&note, "hard").await;
    create(app, "Loose note", json!({ "difficulty": "easy" })).await;
    let paused = create(app, "Parked", json!({ "paused": true })).await;
    assert!(!paused["paused_at"].is_null());
    app.use_sm2().await;
    let old = create(app, "Old style", json!({})).await;
    assert_eq!(app.review(&old, "easy").await["algorithm"], "sm2");
}

fn by_name(items: &Value) -> Vec<Value> {
    let mut items = items.as_array().unwrap().clone();
    items.sort_by_key(|n| n["name"].as_str().unwrap().to_string());
    items
}

#[tokio::test]
async fn export_carries_decks_notes_and_review_state() {
    let app = TestApp::new().await;
    seed_library(&app).await;
    let data = export(&app, json!({})).await;
    assert_eq!(data["format"], "notes-again");
    assert_eq!(data["version"], 1);
    assert_eq!(data["decks"].as_array().unwrap().len(), 1);
    let deck = &data["decks"][0];
    assert_eq!(deck["name"], "Leetcode");
    let note = &deck["notes"][0];
    assert_eq!(note["name"], "Two sum");
    assert_eq!(note["tags"], json!(["dsa"]));
    assert_eq!(note["difficulty"], "hard");
    assert_eq!(note["review"]["algorithm"], "fsrs");
    assert!(note["review"]["fsrs_card"].is_object());
    let ratings: Vec<&Value> = note["review"]["history"]
        .as_array()
        .unwrap()
        .iter()
        .map(|h| &h["rating"])
        .collect();
    assert_eq!(ratings, [&json!("good"), &json!("hard")]);
    assert!(!note["review"]["due_at"].is_null());
    let loose = by_name(&data["notes"]);
    let find = |name: &str| loose.iter().find(|n| n["name"] == name).unwrap().clone();
    assert_eq!(find("Parked")["review"]["paused"], true);
    assert_eq!(find("Old style")["review"]["algorithm"], "sm2");
    assert!(
        find("Old style")["review"]["interval_days"]
            .as_i64()
            .unwrap()
            >= 1
    );
}

#[tokio::test]
async fn export_leaves_out_trashed_notes_and_is_a_download() {
    let app = TestApp::new().await;
    create(&app, "Keep", json!({})).await;
    let gone = create(&app, "Gone", json!({})).await;
    app.delete(&format!("/api/notes/{}", id(&gone)))
        .send()
        .await;
    assert_eq!(names(&export(&app, json!({})).await["notes"]), ["Keep"]);
    let response = app.post("/api/export/notes").json(json!({})).send().await;
    assert!(
        response
            .header("content-disposition")
            .unwrap()
            .starts_with("attachment; filename=")
    );
}

#[tokio::test]
async fn export_then_import_into_an_empty_library_is_lossless() {
    let app = TestApp::new().await;
    seed_library(&app).await;
    let original = export(&app, json!({})).await;
    let restored = TestApp::new().await;
    let result = import(&restored, json!({ "payload": original, "per_day": 1 })).await;
    assert_eq!(result["notes_created"], 4);
    assert_eq!(result["restored_reviews"], 4);
    let again = export(&restored, json!({})).await;
    assert_eq!(again["decks"], original["decks"]);
    assert_eq!(by_name(&again["notes"]), by_name(&original["notes"]));
}

#[tokio::test]
async fn undo_still_works_on_an_imported_review() {
    let app = TestApp::new().await;
    let note = create(&app, "Two sum", json!({})).await;
    let due_before_review = pending(&note)["remind_at"].clone();
    app.review(&note, "good").await;
    let original = export(&app, json!({})).await;

    let restored = TestApp::new().await;
    import(&restored, json!({ "payload": original })).await;
    let imported = restored.get("/api/notes/list").send().await.ok()["items"][0].clone();
    let reviewed = imported["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| !r["reviewed_at"].is_null())
        .unwrap()
        .clone();
    let undone = restored
        .patch(&format!("/api/notes/reminders/{}/now", id(&reviewed)))
        .json(json!({ "action": "undo_review" }))
        .send()
        .await
        .ok();
    let reminders = undone["reminders"].as_array().unwrap();
    assert_eq!(reminders.len(), 1);
    assert!(reminders[0]["reviewed_at"].is_null());
    assert_eq!(reminders[0]["remind_at"], due_before_review);
}

#[tokio::test]
async fn restored_notes_keep_their_due_dates_instead_of_being_paced() {
    let app = TestApp::new().await;
    let later = now() + days(9);
    let payload = json!({ "notes": [
        { "name": "Scheduled", "review": { "algorithm": "sm2", "interval_days": 6, "due_at": iso(later) } },
        { "name": "Fresh 1" },
        { "name": "Fresh 2" },
    ]});
    let result = import(&app, json!({ "payload": payload, "per_day": 1 })).await;
    assert_eq!(result["restored_reviews"], 1);
    assert_eq!(result["due_today"], 1);
    let items = app.get("/api/notes/list").send().await.ok()["items"].clone();
    let scheduled = items
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["name"] == "Scheduled")
        .unwrap()
        .clone();
    assert_eq!(scheduled["interval_days"], 6);
    let due = at(&scheduled["reminders"][0]["remind_at"]);
    assert_eq!(due.timestamp_micros(), later.timestamp_micros());
}

#[tokio::test]
async fn an_invalid_review_block_skips_the_note_with_a_reason() {
    let app = TestApp::new().await;
    let payload = json!({ "notes": [
        { "name": "Bad algorithm", "review": { "algorithm": "anki" } },
        { "name": "Bad card", "review": { "algorithm": "fsrs", "fsrs_card": { "nope": 1 } } },
        { "name": "Bad rating", "review": { "algorithm": "sm2", "history": [
            { "reviewed_at": "2026-01-01T00:00:00Z", "rating": "meh" }
        ]}},
        { "name": "Fine" },
    ]});
    let result = import(&app, json!({ "payload": payload, "dry_run": true })).await;
    assert_eq!(result["notes_created"], 1);
    assert_eq!(result["invalid_skipped"], 3);
    assert_eq!(
        names(&result["issues"]),
        ["Bad algorithm", "Bad card", "Bad rating"]
    );
}

#[tokio::test]
async fn a_paused_deck_round_trips() {
    let app = TestApp::new().await;
    let project = app.project("Later").await;
    create(&app, "Someday", json!({ "project_id": id(&project) })).await;
    app.post(&format!("/api/projects/{}/pause", id(&project)))
        .send()
        .await
        .ok();
    let original = export(&app, json!({})).await;
    assert_eq!(original["decks"][0]["paused"], true);
    let restored = TestApp::new().await;
    import(&restored, json!({ "payload": original })).await;
    let decks = restored.get("/api/projects/list").send().await.ok();
    let later = decks
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["name"] == "Later")
        .unwrap()
        .clone();
    assert_eq!(later["paused"], true);
}

struct Library {
    leetcode: i64,
    reading: i64,
    dsa: i64,
    graphs: i64,
}

async fn filter_library(app: &TestApp) -> Library {
    let leetcode = id(&app.project("Leetcode").await);
    let reading = id(&app.project("Reading").await);
    let dsa = id(&app.tag("dsa").await);
    let graphs = id(&app.tag("graphs").await);
    create(
        app,
        "Two sum",
        json!({ "project_id": leetcode, "tag_ids": [dsa] }),
    )
    .await;
    create(
        app,
        "Dijkstra",
        json!({ "project_id": leetcode, "tag_ids": [dsa, graphs] }),
    )
    .await;
    create(app, "Book notes", json!({ "project_id": reading })).await;
    create(app, "Loose graph", json!({ "tag_ids": [graphs] })).await;
    create(app, "Loose", json!({ "paused": true })).await;
    Library {
        leetcode,
        reading,
        dsa,
        graphs,
    }
}

#[tokio::test]
async fn export_filters_by_project_tag_note_and_status() {
    let app = TestApp::new().await;
    let lib = filter_library(&app).await;
    let only_reading = export(&app, json!({ "project_ids": [lib.reading] })).await;
    assert_eq!(exported_names(&only_reading), set(&["Book notes"]));
    assert_eq!(names(&only_reading["decks"]), ["Reading"]);
    assert_eq!(
        exported_names(
            &export(
                &app,
                json!({ "project_ids": [lib.reading], "include_no_project": true })
            )
            .await
        ),
        set(&["Book notes", "Loose graph", "Loose"])
    );
    assert_eq!(
        exported_names(&export(&app, json!({ "tag_ids": [lib.graphs] })).await),
        set(&["Dijkstra", "Loose graph"])
    );
    assert_eq!(
        exported_names(&export(&app, json!({ "tag_ids": [lib.dsa, lib.graphs] })).await),
        set(&["Two sum", "Dijkstra", "Loose graph"])
    );
    assert_eq!(
        exported_names(
            &export(
                &app,
                json!({ "project_ids": [lib.leetcode], "tag_ids": [lib.graphs] })
            )
            .await
        ),
        set(&["Dijkstra"])
    );
    let listed = app.get("/api/notes/list").send().await.ok()["items"].clone();
    let note_id = |name: &str| {
        id(listed
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["name"] == name)
            .unwrap())
    };
    assert_eq!(
        exported_names(
            &export(
                &app,
                json!({ "note_ids": [note_id("Two sum"), note_id("Loose")] })
            )
            .await
        ),
        set(&["Two sum", "Loose"])
    );
    assert!(
        !exported_names(&export(&app, json!({ "include_paused": false })).await).contains("Loose")
    );
}

#[tokio::test]
async fn count_matches_what_the_export_contains() {
    let app = TestApp::new().await;
    let lib = filter_library(&app).await;
    let count = |options: Value| {
        let app = &app;
        async move {
            app.post("/api/export/count")
                .json(options)
                .send()
                .await
                .ok()
        }
    };
    assert_eq!(count(json!({})).await, json!({ "notes": 5, "decks": 2 }));
    assert_eq!(
        count(json!({ "tag_ids": [lib.graphs] })).await,
        json!({ "notes": 2, "decks": 1 })
    );
    assert_eq!(
        count(json!({ "project_ids": [lib.reading], "tag_ids": [lib.dsa] })).await,
        json!({ "notes": 0, "decks": 0 })
    );
}

#[tokio::test]
async fn export_without_review_progress_imports_as_fresh_notes() {
    let app = TestApp::new().await;
    let note = create(&app, "Studied", json!({})).await;
    app.review(&note, "good").await;
    let data = export(&app, json!({ "include_review": false })).await;
    assert_eq!(data["notes"].as_array().unwrap().len(), 1);
    assert!(data["notes"][0].get("review").is_none());
    let other = TestApp::new().await;
    let result = import(&other, json!({ "payload": data })).await;
    assert_eq!(result["restored_reviews"], 0);
    let imported = other.get("/api/notes/list").send().await.ok()["items"][0].clone();
    let reviewed: Vec<&Value> = imported["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| &r["reviewed_at"])
        .collect();
    assert_eq!(reviewed, [&Value::Null]);
}

async fn note_names(path: &Path) -> Vec<String> {
    let pool = sqlx::SqlitePool::connect_with(
        sqlx::sqlite::SqliteConnectOptions::new()
            .filename(path)
            .read_only(true),
    )
    .await
    .unwrap();
    let rows: Vec<String> = sqlx::query_scalar("SELECT name FROM notes ORDER BY id")
        .fetch_all(&pool)
        .await
        .unwrap();
    pool.close().await;
    rows
}

#[tokio::test]
async fn snapshot_is_a_readable_copy_next_to_the_database() {
    let app = TestApp::new().await;
    app.named("Backed up").await;
    let config = &app.state.config;
    let snapshot = create_snapshot(
        &app.state.db,
        &config.backup_dir(),
        config.backup_keep,
        &app.state.snapshot_lock,
    )
    .await
    .unwrap();
    assert_eq!(
        snapshot.path.parent().unwrap(),
        config.db_path.parent().unwrap().join("backups")
    );
    let name = snapshot.path.file_name().unwrap().to_str().unwrap();
    assert!(name.starts_with("notes-again-"));
    assert_eq!(note_names(&snapshot.path).await, ["Backed up"]);
    let partials = std::fs::read_dir(snapshot.path.parent().unwrap())
        .unwrap()
        .filter(|e| {
            e.as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".partial")
        })
        .count();
    assert_eq!(partials, 0);
}

fn set_mtime(path: &Path, when: SystemTime) {
    std::fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(when)
        .unwrap();
}

#[tokio::test]
async fn old_snapshots_are_pruned() {
    let app = TestApp::with(|c| c.backup_keep = 2).await;
    let config = &app.state.config;
    let folder = config.backup_dir();
    std::fs::create_dir_all(&folder).unwrap();
    for day in 1..=3u64 {
        let old = folder.join(format!("notes-again-2020010{day}-000000.db"));
        std::fs::write(&old, b"").unwrap();
        set_mtime(
            &old,
            SystemTime::UNIX_EPOCH + Duration::from_secs(1_577_836_800 + day * 86_400),
        );
    }
    create_snapshot(
        &app.state.db,
        &folder,
        config.backup_keep,
        &app.state.snapshot_lock,
    )
    .await
    .unwrap();
    let names: Vec<String> = list_snapshots(&folder)
        .iter()
        .map(|s| s.path.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names.len(), 2);
    assert!(names.contains(&"notes-again-20200103-000000.db".to_string()));
}

#[tokio::test]
async fn snapshot_is_due_only_after_the_interval() {
    let app = TestApp::with(|c| c.backup_interval_hours = 24).await;
    let dir = app.state.backup_dir();
    assert!(snapshot_due(&dir, 24));
    let taken = create_snapshot(&app.state.db, &dir, 7, &app.state.snapshot_lock)
        .await
        .unwrap();
    assert!(!snapshot_due(&dir, 24));
    set_mtime(
        &taken.path,
        SystemTime::now() - Duration::from_secs(25 * 3600),
    );
    assert!(snapshot_due(&dir, 24));
    assert!(!snapshot_due(&dir, 0));
}

#[tokio::test]
async fn restore_swaps_in_the_backup_and_keeps_the_old_file() {
    let app = TestApp::new().await;
    app.named("Before").await;
    let backup = create_snapshot(
        &app.state.db,
        &app.state.backup_dir(),
        7,
        &app.state.snapshot_lock,
    )
    .await
    .unwrap()
    .path;
    app.named("After").await;
    let live = app.path("live.db");
    notes_again_server::backups::copy_database(&app.state.db, &live)
        .await
        .unwrap();
    let moved = restore_database(&backup, &live).await.unwrap();
    assert_eq!(note_names(&live).await, ["Before"]);
    assert_eq!(
        note_names(&moved.expect("the old file is kept")).await,
        ["Before", "After"]
    );
}

#[tokio::test]
async fn restore_refuses_files_that_are_not_notes_databases() {
    let dir = tempfile::tempdir().unwrap();
    for content in [&b"not a database"[..], b""] {
        let bogus = dir.path().join("bogus.db");
        std::fs::write(&bogus, content).unwrap();
        let live = dir.path().join("live.db");
        std::fs::write(&live, b"keep me").unwrap();
        let error = restore_database(&bogus, &live).await.unwrap_err();
        assert!(error.contains("Not restoring"), "{error}");
        assert_eq!(std::fs::read(&live).unwrap(), b"keep me");
    }
}

#[tokio::test]
async fn system_info_reports_the_database_and_backups() {
    let app = TestApp::new().await;
    app.named("n").await;
    let info = app.get("/api/system").send().await.ok();
    assert_eq!(
        info["database_path"],
        app.state.config.db_path.display().to_string()
    );
    assert!(info["database_size_bytes"].as_u64().unwrap() > 0);
    assert_eq!(info["note_count"], 1);
    assert_eq!(info["auth_mode"], "none");
    assert!(info["backups"]["latest"].is_null());
    let taken = app.post("/api/system/snapshot").send().await.ok();
    let info = app.get("/api/system").send().await.ok();
    assert_eq!(info["backups"]["count"], 1);
    assert_eq!(info["backups"]["latest"]["name"], taken["name"]);
}

#[tokio::test]
async fn download_is_a_consistent_database_copy() {
    let app = TestApp::new().await;
    app.named("Downloaded").await;
    let response = app.get("/api/system/database").send().await;
    assert_eq!(response.code(), 200);
    assert!(
        response
            .header("content-disposition")
            .unwrap()
            .contains("notes-again-")
    );
    let copy = app.path("download.db");
    std::fs::write(&copy, &response.body).unwrap();
    assert_eq!(note_names(&copy).await, ["Downloaded"]);
}

const LEGACY_DROPS: &[(&str, &[&str])] = &[
    (
        "notes",
        &[
            "uid",
            "sync_version",
            "ease_factor",
            "interval_days",
            "algorithm",
            "fsrs_card",
            "paused_at",
            "in_review",
        ],
    ),
    (
        "reminders",
        &["uid", "rating", "ease_factor", "interval_days", "fsrs_card"],
    ),
    (
        "tags",
        &[
            "uid",
            "sync_version",
            "is_difficulty",
            "default_ease_factor",
        ],
    ),
    ("projects", &["uid", "sync_version", "paused"]),
    ("settings", &["sync_version"]),
];

async fn build_legacy_database(path: &Path) {
    let pool = sqlx::SqlitePool::connect_with(
        sqlx::sqlite::SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(false),
    )
    .await
    .unwrap();
    let baseline = include_str!("../migrations/0001_baseline.sql");
    let tables: String = baseline
        .split(';')
        .filter(|s| s.trim_start().starts_with("CREATE TABLE"))
        .map(|s| format!("{s};"))
        .collect();
    sqlx::raw_sql(sqlx::AssertSqlSafe(tables))
        .execute(&pool)
        .await
        .unwrap();
    for (table, columns) in LEGACY_DROPS {
        for column in *columns {
            sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "ALTER TABLE {table} DROP COLUMN {column}"
            )))
            .execute(&pool)
            .await
            .unwrap();
        }
    }
    sqlx::raw_sql(
        "INSERT INTO notes (id, name, content, created_at, updated_at, user_id) \
         VALUES (1, 'Legacy note', 'written before search existed', '2024-01-01 00:00:00', '2024-01-01 00:00:00', 1); \
         INSERT INTO reminders (note_id, remind_at, created_at, updated_at) VALUES \
         (1, '2024-02-01 00:00:00', '2024-01-01 00:00:00', '2024-01-01 00:00:00'), \
         (1, '2024-03-01 00:00:00', '2024-01-01 00:00:00', '2024-01-01 00:00:00'); \
         INSERT INTO tags (name, created_at) VALUES ('Hard', '2024-01-01 00:00:00');",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;
}

#[tokio::test]
async fn an_old_database_is_upgraded_in_place_on_start_and_again_harmlessly() {
    let dir = tempfile::tempdir().unwrap();
    let mut config = base_config(&dir);
    config.db_path = dir.path().join("legacy.db");
    build_legacy_database(&config.db_path).await;
    let app = TestApp::start(dir, config).await;

    for (table, dropped) in LEGACY_DROPS {
        let rows: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT name FROM pragma_table_info('{table}')"
        )))
        .fetch_all(&app.state.db)
        .await
        .unwrap();
        for column in *dropped {
            assert!(rows.contains(&column.to_string()), "{table}.{column}");
        }
    }

    let note = app.get("/api/notes/1").send().await.ok();
    assert_eq!(note["in_review"], true);
    assert_eq!(names(&note["tags"]), ["Medium"]);
    let pending: Vec<String> = note["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["reviewed_at"].is_null())
        .map(|r| r["remind_at"].as_str().unwrap()[..10].to_string())
        .collect();
    assert_eq!(pending, ["2024-02-01"]);
    let tags = app.get("/api/tags/list").send().await.ok();
    let hard = tags
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == "Hard")
        .unwrap()
        .clone();
    assert_eq!(hard["is_difficulty"], true);
    let hits = app.get("/api/search?q=before%20search").send().await.ok();
    assert_eq!(ids(&hits["notes"]), [1]);

    let uid = app
        .scalar_opt_str("SELECT uid FROM notes WHERE id = 1")
        .await
        .unwrap();
    assert_eq!(uid.len(), 32);
    assert!(
        app.scalar_i64("SELECT sync_version FROM notes WHERE id = 1")
            .await
            > 0
    );
    assert_eq!(
        app.scalar_i64("SELECT count(*) FROM reminders WHERE uid IS NULL OR uid = ''")
            .await,
        0
    );
    assert_eq!(
        app.scalar_opt_str("SELECT uid FROM tags WHERE name = 'Hard'")
            .await
            .as_deref(),
        Some("difficulty-hard")
    );

    let app = app.restart(|_| {}).await;
    assert_eq!(
        app.get("/api/notes/1").send().await.ok()["name"],
        "Legacy note"
    );
}

async fn desktop_app(dir: tempfile::TempDir) -> TestApp {
    let mut config = base_config(&dir);
    config.auth_mode = notes_again_server::config::AuthMode::Desktop;
    config.desktop_secret = Some("secret".into());
    let app = TestApp::start(dir, config).await;
    assert_eq!(
        app.get("/api/auth/desktop?secret=secret")
            .send()
            .await
            .code(),
        303
    );
    app
}

#[tokio::test]
async fn snapshots_can_be_listed_and_downloaded_by_name_only() {
    let app = TestApp::new().await;
    app.named("In the snapshot").await;
    let taken = app.post("/api/system/snapshot").send().await.ok();
    let listed = app.get("/api/system/snapshots").send().await.ok();
    assert_eq!(names(&listed), [taken["name"].as_str().unwrap()]);
    let name = taken["name"].as_str().unwrap();
    let download = app
        .get(&format!("/api/system/snapshots/{name}"))
        .send()
        .await;
    assert_eq!(download.code(), 200);
    let copy = app.path("snapshot-download.db");
    std::fs::write(&copy, &download.body).unwrap();
    assert_eq!(note_names(&copy).await, ["In the snapshot"]);
    for bad in [
        "test.db",
        "notes-again-..%2F..%2Ftest.db",
        "notes-again-missing.db",
    ] {
        let response = app
            .get(&format!("/api/system/snapshots/{bad}"))
            .send()
            .await;
        assert_eq!(response.code(), 404, "{bad}");
    }
}

#[tokio::test]
async fn backup_folder_and_restore_are_desktop_only() {
    let app = TestApp::new().await;
    let info = app.get("/api/system").send().await.ok();
    assert_eq!(info["backups"]["can_change_directory"], false);
    assert_eq!(info["backups"]["can_restore"], false);
    let change = app
        .put("/api/system/backups")
        .json(json!({ "directory": "/tmp" }))
        .send()
        .await;
    assert_eq!(change.code(), 404);
    let taken = app.post("/api/system/snapshot").send().await.ok();
    let restore = app
        .post(&format!(
            "/api/system/snapshots/{}/restore",
            taken["name"].as_str().unwrap()
        ))
        .send()
        .await;
    assert_eq!(restore.code(), 404);
}

#[tokio::test]
async fn the_desktop_backup_folder_is_used_validated_and_remembered() {
    let folder = tempfile::tempdir().unwrap();
    let app = desktop_app(tempfile::tempdir().unwrap()).await;
    let relative = app
        .put("/api/system/backups")
        .json(json!({ "directory": "relative/folder" }))
        .send()
        .await;
    assert_eq!(relative.code(), 400);
    let chosen = folder.path().join("Notes backups");
    let info = app
        .put("/api/system/backups")
        .json(json!({ "directory": chosen.display().to_string() }))
        .send()
        .await
        .ok();
    assert_eq!(info["backups"]["directory"], chosen.display().to_string());
    assert_eq!(info["backups"]["custom_directory"], true);
    let taken = app.post("/api/system/snapshot").send().await.ok();
    assert!(chosen.join(taken["name"].as_str().unwrap()).is_file());

    let app = app.restart(|_| {}).await;
    assert_eq!(app.state.backup_dir(), chosen);
    let reset = app
        .put("/api/system/backups")
        .json(json!({ "directory": null }))
        .send()
        .await
        .ok();
    assert_eq!(reset["backups"]["custom_directory"], false);
    assert_eq!(
        reset["backups"]["directory"],
        reset["backups"]["default_directory"]
    );
}

#[tokio::test]
async fn restoring_on_the_desktop_applies_the_snapshot_on_the_next_start() {
    let app = desktop_app(tempfile::tempdir().unwrap()).await;
    app.named("Before").await;
    let taken = app.post("/api/system/snapshot").send().await.ok();
    app.named("After").await;
    let restore = app
        .post(&format!(
            "/api/system/snapshots/{}/restore",
            taken["name"].as_str().unwrap()
        ))
        .send()
        .await;
    assert_eq!(restore.code(), 204);
    tokio::time::timeout(Duration::from_secs(1), app.state.restart.notified())
        .await
        .expect("the desktop app is asked to restart");

    let db_path = app.state.config.db_path.clone();
    app.state.db.close().await;
    let restored = notes_again_server::backups::apply_pending_restore(&db_path)
        .await
        .unwrap();
    assert!(restored.is_some());
    let app = app.restart(|_| {}).await;
    let names_now = names(&app.get("/api/notes/list").send().await.ok()["items"]);
    assert_eq!(names_now, ["Before"]);
    assert!(
        notes_again_server::backups::apply_pending_restore(&db_path)
            .await
            .unwrap()
            .is_none()
    );
}
