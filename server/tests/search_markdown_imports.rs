mod common;

use std::collections::BTreeMap;

use common::*;
use serde_json::Value;

const MARK_START: char = '\x02';
const MARK_END: char = '\x03';

fn marked(term: &str) -> String {
    format!("{MARK_START}{term}{MARK_END}")
}

async fn create(app: &TestApp, name: &str, content: &str) -> Value {
    app.note(json!({ "name": name, "content": content })).await
}

async fn search(app: &TestApp, q: &str) -> Value {
    app.get(&format!("/api/search?q={}", enc(q)))
        .send()
        .await
        .ok()
}

async fn hits(app: &TestApp, q: &str) -> Vec<i64> {
    ids(&search(app, q).await["notes"])
}

#[tokio::test]
async fn finds_notes_by_substring_of_title_or_body() {
    let app = TestApp::new().await;
    let title = create(
        &app,
        "Longest Substring Without Repeating Characters",
        "body",
    )
    .await;
    let body = create(&app, "Two Sum", "Use a map from value to index.").await;
    create(&app, "Unrelated", "nothing to see").await;
    assert_eq!(hits(&app, "substr").await, [id(&title)]);
    assert_eq!(hits(&app, "rom valu").await, [id(&body)]);
    assert_eq!(hits(&app, "value").await, [id(&body)]);
}

#[tokio::test]
async fn every_term_must_match() {
    let app = TestApp::new().await;
    let both = create(&app, "Sliding window", "keep a set of seen values").await;
    create(&app, "Sliding puzzle", "nothing else").await;
    assert_eq!(hits(&app, "sliding seen").await, [id(&both)]);
}

#[tokio::test]
async fn title_matches_rank_above_body_matches() {
    let app = TestApp::new().await;
    let in_body = create(
        &app,
        "Arrays",
        "graph traversal, graph colouring, graph cuts",
    )
    .await;
    let in_title = create(&app, "Graph basics", "nodes and edges").await;
    assert_eq!(hits(&app, "graph").await, [id(&in_title), id(&in_body)]);
}

#[tokio::test]
async fn results_are_highlighted_and_snippets_are_plain_text() {
    let app = TestApp::new().await;
    create(
        &app,
        "**Contains** Duplicate",
        "# Approach\n\nWalk the array once and keep a [set](https://x.dev) of seen values.",
    )
    .await;
    let hit = search(&app, "set").await["notes"][0].clone();
    assert_eq!(hit["title"], "Contains Duplicate");
    assert_eq!(hit["title_marked"], "Contains Duplicate");
    let snippet = hit["snippet"].as_str().unwrap();
    assert!(snippet.contains(&marked("set")));
    assert!(!snippet.contains("https://"));
    assert!(!snippet.contains('#'));
    assert_eq!(hit["status"], "active");
}

#[tokio::test]
async fn long_bodies_get_a_window_around_the_first_match() {
    let app = TestApp::new().await;
    let filler: Vec<String> = (0..200).map(|i| format!("word{i}")).collect();
    let filler = filler.join(" ");
    create(&app, "Long", &format!("{filler} needle {filler}")).await;
    let snippet = search(&app, "needle").await["notes"][0]["snippet"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(snippet.starts_with('…') && snippet.ends_with('…'));
    assert!(snippet.contains(&marked("needle")));
    assert!(snippet.chars().count() < 200);
}

#[tokio::test]
async fn index_follows_edits_deletes_and_hard_deletes() {
    let app = TestApp::new().await;
    let note = create(&app, "Original title", "first body").await;
    let nid = id(&note);
    assert_eq!(hits(&app, "original").await, [nid]);
    app.patch(&format!("/api/notes/{nid}"))
        .json(json!({ "name": "Renamed", "content": "second body" }))
        .send()
        .await
        .ok();
    assert!(hits(&app, "original").await.is_empty());
    assert_eq!(hits(&app, "renamed").await, [nid]);
    assert_eq!(hits(&app, "second").await, [nid]);
    app.delete(&format!("/api/notes/{nid}")).send().await;
    assert!(hits(&app, "renamed").await.is_empty());
    app.patch(&format!("/api/notes/{nid}/restore")).send().await;
    assert_eq!(hits(&app, "renamed").await, [nid]);

    app.exec(&format!("DELETE FROM notes WHERE id = {nid}"))
        .await;
    let left = app
        .scalar_i64("SELECT count(*) FROM notes_fts WHERE notes_fts MATCH 'Renamed'")
        .await;
    assert_eq!(left, 0);
}

#[tokio::test]
async fn hostile_queries_never_error() {
    let app = TestApp::new().await;
    create(&app, "Plain note", "body").await;
    let long = "x".repeat(400);
    let longer = "x".repeat(1000);
    for q in [
        "\"",
        "\"\"",
        "*",
        "NEAR(",
        "-x",
        "a:b",
        "title:foo",
        "AND OR NOT",
        "(",
        "\\",
        "%",
        "_",
        "🙂",
        &long,
        &longer,
    ] {
        let response = app.get(&format!("/api/search?q={}", enc(q))).send().await;
        let expected = if q.chars().count() > 400 { 422 } else { 200 };
        assert_eq!(response.code(), expected, "{q}");
    }
}

#[tokio::test]
async fn like_wildcards_are_literal() {
    let app = TestApp::new().await;
    create(&app, "100% sure", "snake_case").await;
    create(&app, "Other", "snakeXcase").await;
    assert_eq!(hits(&app, "0%").await.len(), 1);
    assert_eq!(hits(&app, "e_c").await.len(), 1);
}

#[tokio::test]
async fn short_terms_search_titles_or_filter_indexed_matches() {
    let app = TestApp::new().await;
    create(&app, "Zeta", "uses dp").await;
    let title = create(&app, "dp on trees", "body").await;
    assert_eq!(hits(&app, "dp").await, [id(&title)]);

    let app = TestApp::new().await;
    let body = create(&app, "Trees one", "uses dp").await;
    create(&app, "Trees two", "greedy").await;
    assert_eq!(hits(&app, "trees dp").await, [id(&body)]);
}

#[tokio::test]
async fn accents_are_ignored() {
    let app = TestApp::new().await;
    let note = create(&app, "Café notes", "body").await;
    assert_eq!(hits(&app, "cafe").await, [id(&note)]);
}

#[tokio::test]
async fn projects_and_tags_are_found_by_name() {
    let app = TestApp::new().await;
    let project = app.project("NeetCode 150").await;
    let tag = app.tag("neetcode-graphs").await;
    app.note(json!({ "project_id": id(&project), "tag_ids": [id(&tag)] }))
        .await;
    let results = search(&app, "neetcode").await;
    assert_eq!(results["projects"].as_array().unwrap().len(), 1);
    assert_eq!(results["projects"][0]["id"], project["id"]);
    assert_eq!(results["projects"][0]["note_count"], 1);
    assert_eq!(results["tags"].as_array().unwrap().len(), 1);
    assert_eq!(results["tags"][0]["id"], tag["id"]);
    assert_eq!(results["tags"][0]["note_count"], 1);
    assert_eq!(
        results["projects"][0]["name_marked"],
        format!("{} 150", marked("NeetCode"))
    );
}

#[tokio::test]
async fn empty_query_returns_nothing() {
    let app = TestApp::new().await;
    app.named("A note").await;
    assert_eq!(
        search(&app, "   ").await,
        json!({ "notes": [], "projects": [], "tags": [] })
    );
}

#[tokio::test]
async fn notes_list_search_uses_the_same_matching() {
    let app = TestApp::new().await;
    let note = create(&app, "Longest Substring", "sliding window").await;
    create(&app, "Other", "body").await;
    assert_eq!(app.listed("search=substr").await, [id(&note)]);
    assert_eq!(app.listed("search=dow").await, [id(&note)]);
}

#[tokio::test]
async fn existing_databases_get_the_index_built() {
    let app = TestApp::new().await;
    let note = create(&app, "Built later", "body").await;
    app.exec(
        "DROP TRIGGER notes_fts_after_insert; DROP TRIGGER notes_fts_after_delete; \
         DROP TRIGGER notes_fts_after_update; DROP TABLE notes_fts;",
    )
    .await;
    let app = app.restart(|_| {}).await;
    assert_eq!(hits(&app, "built").await, [id(&note)]);
    let fresh = create(&app, "Added after", "body").await;
    assert_eq!(hits(&app, "added").await, [id(&fresh)]);
}

async fn markdown(app: &TestApp, note: &Value) -> String {
    let response = app
        .get(&format!("/api/notes/{}/markdown", id(note)))
        .send()
        .await;
    assert_eq!(response.code(), 200, "{}", response.text());
    assert_eq!(
        response.header("content-type").as_deref(),
        Some("text/markdown; charset=utf-8")
    );
    response.text()
}

fn split(document: &str) -> (BTreeMap<String, Value>, String) {
    let rest = document.strip_prefix("---\n").expect("frontmatter");
    let (head, body) = rest.split_once("\n---\n").expect("frontmatter end");
    let meta = head
        .lines()
        .map(|line| {
            let (key, value) = line.split_once(": ").expect("key: value");
            let value = serde_json::from_str(value).unwrap_or_else(|_| json!(value));
            (key.to_string(), value)
        })
        .collect();
    (meta, body.to_string())
}

#[tokio::test]
async fn frontmatter_carries_the_notes_metadata() {
    let app = TestApp::new().await;
    let project = app.project("NeetCode 150").await;
    let a = id(&app.tag("sliding-window").await);
    let b = id(&app.tag("Arrays").await);
    let note = app
        .note(json!({
            "name": "[3. Longest Substring](https://leetcode.com/problems/x/)",
            "content": "Body text.",
            "project_id": id(&project),
            "tag_ids": [a, b],
            "difficulty": "hard",
        }))
        .await;
    let (meta, body) = split(&markdown(&app, &note).await);
    assert_eq!(meta["title"], "3. Longest Substring");
    assert_eq!(meta["source"], "https://leetcode.com/problems/x/");
    assert_eq!(meta["project"], "NeetCode 150");
    assert_eq!(meta["tags"], json!(["Arrays", "sliding-window"]));
    assert_eq!(meta["difficulty"], "hard");
    assert_eq!(meta["status"], "in-review");
    assert_eq!(meta["reviews"], 0);
    for key in ["next_review", "created", "updated"] {
        assert!(meta.contains_key(key), "{key}");
    }
    assert_eq!(
        body,
        "\n# [3. Longest Substring](https://leetcode.com/problems/x/)\n\nBody text.\n"
    );
}

#[tokio::test]
async fn titles_that_look_like_yaml_stay_quoted() {
    let app = TestApp::new().await;
    for title in [
        "He said \"hi\": a #1 note",
        "key: value",
        "- starts like a list",
        "Tab\there",
        "‘Unicode’ 日本語",
    ] {
        let note = create(&app, title, "Body text.").await;
        let (meta, _) = split(&markdown(&app, &note).await);
        assert_eq!(meta["title"], title);
    }
}

#[tokio::test]
async fn status_and_review_fields_follow_the_review_state() {
    let app = TestApp::new().await;
    let note = app.named("A note").await;
    for status in ["paused", "note-only"] {
        app.patch(&format!("/api/notes/{}/status", id(&note)))
            .json(json!({ "status": status }))
            .send()
            .await
            .ok();
        let (meta, _) = split(&markdown(&app, &note).await);
        assert_eq!(meta["status"], status);
        assert!(!meta.contains_key("next_review"));
    }
    let other = app.named("Reviewed").await;
    app.review(&other, "good").await;
    let (meta, _) = split(&markdown(&app, &other).await);
    assert_eq!(meta["reviews"], 1);
    assert!(meta.contains_key("next_review"));
}

#[tokio::test]
async fn a_notes_own_frontmatter_is_merged_and_wins_on_conflicts() {
    let app = TestApp::new().await;
    let note = create(
        &app,
        "A note",
        "---\nauthor: me\nstatus: draft\n---\n\nThe body.",
    )
    .await;
    let (meta, body) = split(&markdown(&app, &note).await);
    assert_eq!(meta["author"], "me");
    assert_eq!(meta["status"], "draft");
    assert_eq!(meta["title"], "A note");
    assert!(!body.contains("---"));
    assert!(body.ends_with("\nThe body.\n"));
}

#[tokio::test]
async fn a_leading_h1_matching_the_title_is_not_repeated() {
    let app = TestApp::new().await;
    let note = create(&app, "Graphs", "# Graphs\n\nBFS first.").await;
    assert_eq!(
        split(&markdown(&app, &note).await).1,
        "\n# Graphs\n\nBFS first.\n"
    );
    let other = create(&app, "Graphs", "# Trees\n\nDFS first.").await;
    assert_eq!(
        split(&markdown(&app, &other).await).1,
        "\n# Graphs\n\n# Trees\n\nDFS first.\n"
    );
}

#[tokio::test]
async fn body_markdown_and_code_are_kept_verbatim() {
    let app = TestApp::new().await;
    let content = "Intro  \nhard break\n\n```python\n\n\n\nx = 1  \n```\n\n> quote\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    let note = create(&app, "A note", &format!("\r\n\n{content}\n\n\n")).await;
    assert_eq!(
        split(&markdown(&app, &note).await).1,
        format!("\n# A note\n\n{content}\n")
    );
}

#[tokio::test]
async fn empty_notes_still_produce_a_document() {
    let app = TestApp::new().await;
    let note = create(&app, "   ", "").await;
    let (meta, body) = split(&markdown(&app, &note).await);
    assert_eq!(meta["title"], "Untitled");
    assert_eq!(body, "\n# Untitled\n");
}

#[tokio::test]
async fn download_names_the_file_after_the_title() {
    let app = TestApp::new().await;
    let note = create(&app, "Café: Sorting / Searching?", "Body").await;
    let response = app
        .get(&format!("/api/notes/{}/markdown?download=1", id(&note)))
        .send()
        .await;
    let disposition = response.header("content-disposition").unwrap();
    assert!(disposition.starts_with("attachment; filename=\"Caf-Sorting-Searching.md\""));
    assert!(disposition.contains("filename*=UTF-8''Caf%C3%A9-Sorting-Searching.md"));
}

#[tokio::test]
async fn trashed_and_missing_notes_have_no_markdown() {
    let app = TestApp::new().await;
    let note = app.named("A note").await;
    app.delete(&format!("/api/notes/{}", id(&note)))
        .send()
        .await;
    let path = format!("/api/notes/{}/markdown", id(&note));
    assert_eq!(app.get(&path).send().await.code(), 404);
    assert_eq!(
        app.get("/api/notes/999999/markdown").send().await.code(),
        404
    );
}

async fn import(app: &TestApp, body: Value) -> Value {
    app.post("/api/import/notes").json(body).send().await.ok()
}

async fn total(app: &TestApp) -> i64 {
    app.get("/api/notes/list").send().await.ok()["total"]
        .as_i64()
        .unwrap()
}

#[tokio::test]
async fn dry_run_reports_what_would_happen_without_writing_anything() {
    let app = TestApp::new().await;
    let payload = json!({ "notes": [{ "name": "A loose note", "content": "body" }] });
    let preview = import(&app, json!({ "payload": payload, "dry_run": true })).await;
    assert_eq!(preview["dry_run"], true);
    assert_eq!(preview["notes_created"], 1);
    assert_eq!(total(&app).await, 0);

    let real = import(&app, json!({ "payload": payload, "dry_run": false })).await;
    assert_eq!(real["dry_run"], false);
    assert_eq!(real["notes_created"], 1);
    let listed = app.get("/api/notes/list").send().await.ok();
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["name"], "A loose note");
}

#[tokio::test]
async fn dry_run_and_commit_report_identical_numbers() {
    let app = TestApp::new().await;
    let payload = json!({
        "decks": [{ "name": "Deck", "notes": [{ "name": "n1", "content": "c" }] }],
        "notes": [{ "name": "n2", "content": "c" }],
    });
    let preview = import(&app, json!({ "payload": payload, "dry_run": true })).await;
    let real = import(&app, json!({ "payload": payload })).await;
    for key in [
        "notes_created",
        "new_decks",
        "new_tags",
        "duplicates_skipped",
        "invalid_skipped",
    ] {
        assert_eq!(preview[key], real[key], "{key}");
    }
}

#[tokio::test]
async fn import_creates_decks_and_tags_named_in_the_file() {
    let app = TestApp::new().await;
    let payload = json!({ "decks": [{ "name": "Leetcode", "notes": [
        { "name": "Two sum", "content": "c", "tags": ["dsa"], "difficulty": "hard" }
    ]}]});
    let result = import(&app, json!({ "payload": payload })).await;
    assert_eq!(result["new_decks"], 1);
    assert_eq!(result["new_tags"], 1);
    let projects = names(&app.get("/api/projects/list").send().await.ok());
    assert!(projects.contains(&"Leetcode".to_string()));
    let note = app.get("/api/notes/list").send().await.ok()["items"][0].clone();
    assert_eq!(note["project"]["name"], "Leetcode");
    assert_eq!(sorted(names(&note["tags"])), ["Hard", "dsa"]);
}

#[tokio::test]
async fn import_matches_existing_decks_and_tags_case_insensitively() {
    let app = TestApp::new().await;
    app.project("Leetcode").await;
    app.tag("dsa").await;
    let payload = json!({ "decks": [{ "name": "leetcode", "notes": [
        { "name": "n", "content": "c", "tags": ["DSA"] }
    ]}]});
    let result = import(&app, json!({ "payload": payload })).await;
    assert_eq!(result["new_decks"], 0);
    assert_eq!(result["new_tags"], 0);
    let projects = app.get("/api/projects/list").send().await.ok();
    assert_eq!(projects.as_array().unwrap().len(), 1);
    let tags = app.get("/api/tags/list").send().await.ok();
    let regular = tags
        .as_array()
        .unwrap()
        .iter()
        .filter(|t| t["is_difficulty"] == false)
        .count();
    assert_eq!(regular, 1);
}

#[tokio::test]
async fn a_notes_own_deck_wins_over_its_enclosing_deck() {
    let app = TestApp::new().await;
    let payload = json!({ "decks": [{ "name": "Outer", "notes": [
        { "name": "n", "content": "c", "deck": "Inner" }
    ]}]});
    import(&app, json!({ "payload": payload })).await;
    let note = app.get("/api/notes/list").send().await.ok()["items"][0].clone();
    assert_eq!(note["project"]["name"], "Inner");
}

#[tokio::test]
async fn tags_named_after_difficulty_labels_are_ignored_with_a_warning() {
    let app = TestApp::new().await;
    let payload = json!({ "notes": [{ "name": "n", "content": "c", "tags": ["Easy"] }] });
    let result = import(&app, json!({ "payload": payload })).await;
    let note = app.get("/api/notes/list").send().await.ok()["items"][0].clone();
    assert_eq!(names(&note["tags"]), ["Medium"]);
    assert!(!result["warnings"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn reimporting_the_same_file_skips_duplicates_per_deck() {
    let app = TestApp::new().await;
    let payload = json!({ "notes": [{ "name": "n", "content": "c" }] });
    import(&app, json!({ "payload": payload })).await;
    let second = import(&app, json!({ "payload": payload })).await;
    assert_eq!(second["notes_created"], 0);
    assert_eq!(second["duplicates_skipped"], 1);
    assert_eq!(second["issues"].as_array().unwrap().len(), 1);
    assert_eq!(total(&app).await, 1);

    let app = TestApp::new().await;
    let decks = json!({ "decks": [
        { "name": "A", "notes": [{ "name": "n", "content": "c" }] },
        { "name": "B", "notes": [{ "name": "n", "content": "c" }] },
    ]});
    let result = import(&app, json!({ "payload": decks })).await;
    assert_eq!(result["notes_created"], 2);
    assert_eq!(result["duplicates_skipped"], 0);
}

#[tokio::test]
async fn invalid_rows_are_skipped_with_a_reason() {
    let app = TestApp::new().await;
    let payload = json!({ "notes": [
        { "name": "Fine", "content": "c" }, { "content": "no name" }, { "name": "  " }, "not an object"
    ]});
    let result = import(&app, json!({ "payload": payload })).await;
    assert_eq!(result["notes_created"], 1);
    assert_eq!(result["invalid_skipped"], 3);
    assert_eq!(total(&app).await, 1);
}

#[tokio::test]
async fn malformed_payloads_and_out_of_range_pacing_400() {
    let app = TestApp::new().await;
    let shape = app
        .post("/api/import/notes")
        .json(json!({ "payload": { "unexpected": "shape" } }))
        .send()
        .await;
    assert_eq!(shape.code(), 400);
    let pacing = app
        .post("/api/import/notes")
        .json(json!({ "payload": { "notes": [] }, "per_day": 5000, "dry_run": true }))
        .send()
        .await;
    assert_eq!(pacing.code(), 400);
}

#[tokio::test]
async fn per_day_pacing_spreads_new_notes() {
    let app = TestApp::new().await;
    let notes: Vec<Value> = (0..3)
        .map(|i| json!({ "name": format!("n{i}"), "content": "c" }))
        .collect();
    let result = import(&app, json!({ "payload": { "notes": notes }, "per_day": 0 })).await;
    assert_eq!(result["due_today"], 3);
    assert_eq!(result["days_span"], 1);

    let app = TestApp::new().await;
    let payload = json!({ "decks": [{ "name": "D", "per_day": 1, "notes": [
        { "name": "n1", "content": "c" }, { "name": "n2", "content": "c" }
    ]}]});
    let result = import(&app, json!({ "payload": payload, "per_day": 10 })).await;
    assert_eq!(result["decks"][0]["per_day"], 1);
    assert_eq!(result["days_span"], 2);
}
