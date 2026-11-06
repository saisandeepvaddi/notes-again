mod common;

use common::*;

#[tokio::test]
async fn create_note_gets_a_medium_difficulty_tag_and_a_due_reminder_by_default() {
    let app = TestApp::new().await;
    let note = app.named("A note").await;
    assert_eq!(names(&note["tags"]), ["Medium"]);
    assert_eq!(note["ease_factor"], 2.5);
    assert_eq!(note["reminders"].as_array().unwrap().len(), 1);
    assert!(note["reminders"][0]["reviewed_at"].is_null());
    assert!(at(&note["reminders"][0]["remind_at"]) <= now());
}

#[tokio::test]
async fn create_note_applies_requested_difficulty_and_tags() {
    let app = TestApp::new().await;
    let rust = app.tag("rust").await;
    let note = app
        .note(json!({ "difficulty": "hard", "tag_ids": [id(&rust)] }))
        .await;
    assert_eq!(sorted(names(&note["tags"])), ["Hard", "rust"]);
    assert_eq!(note["ease_factor"], 1.8);
}

#[tokio::test]
async fn create_note_difficulty_tag_ids_are_ignored_not_applied_twice() {
    let app = TestApp::new().await;
    let hard = app.tag_id("Hard").await;
    let note = app
        .note(json!({ "difficulty": "easy", "tag_ids": [hard] }))
        .await;
    assert_eq!(names(&note["tags"]), ["Easy"]);
}

#[tokio::test]
async fn create_note_attaches_to_a_project() {
    let app = TestApp::new().await;
    let project = app.project("Reading").await;
    let note = app.note(json!({ "project_id": id(&project) })).await;
    assert_eq!(note["project"]["name"], "Reading");
}

#[tokio::test]
async fn create_note_with_unknown_project_404s() {
    let app = TestApp::new().await;
    let response = app
        .post("/api/notes/create")
        .json(json!({ "name": "x", "content": "y", "project_id": 999 }))
        .send()
        .await;
    assert_eq!(response.code(), 404);
}

#[tokio::test]
async fn get_missing_or_deleted_note_404s() {
    let app = TestApp::new().await;
    assert_eq!(app.get("/api/notes/999").send().await.code(), 404);
    let note = app.named("n").await;
    app.delete(&format!("/api/notes/{}", id(&note)))
        .send()
        .await;
    assert_eq!(
        app.get(&format!("/api/notes/{}", id(&note)))
            .send()
            .await
            .code(),
        404
    );
}

#[tokio::test]
async fn list_filters_by_tag_and_project() {
    let app = TestApp::new().await;
    let project = app.project("P").await;
    let tag = app.tag("t").await;
    let in_both = app
        .note(json!({ "name": "In both", "project_id": id(&project), "tag_ids": [id(&tag)] }))
        .await;
    app.named("In neither").await;
    assert_eq!(
        app.listed(&format!("project_id={}", id(&project))).await,
        [id(&in_both)]
    );
    assert_eq!(
        app.listed(&format!("tag_id={}", id(&tag))).await,
        [id(&in_both)]
    );
}

#[tokio::test]
async fn list_search_matches_name_or_content() {
    let app = TestApp::new().await;
    let by_name = app
        .note(json!({ "name": "Findable name", "content": "irrelevant" }))
        .await;
    app.note(json!({ "name": "Other", "content": "also irrelevant" }))
        .await;
    let by_content = app
        .note(json!({ "name": "Unrelated name", "content": "a findable phrase here" }))
        .await;
    assert_eq!(
        app.listed("search=findable").await,
        sorted(vec![id(&by_name), id(&by_content)])
    );
}

#[tokio::test]
async fn list_search_matches_rendered_title_text() {
    let cases = [
        (
            "Two pointers: **sliding window** with `deque`",
            "pointers: sliding window with deque",
        ),
        ("## Hello there", "hello there"),
        (
            "Renew passport at [gov.uk](https://www.gov.uk/renew)",
            "passport at gov.uk",
        ),
        (
            "Renew passport at [gov.uk](https://www.gov.uk/renew)",
            "gov.uk/renew",
        ),
        ("Read ~~old~~ *new* docs", "old new docs"),
        ("keep snake_case_names", "snake_case_names"),
    ];
    for (name, query) in cases {
        let app = TestApp::new().await;
        let matched = app
            .note(json!({ "name": name, "content": "irrelevant" }))
            .await;
        app.note(json!({ "name": "Other", "content": "also irrelevant" }))
            .await;
        assert_eq!(
            app.listed(&format!("search={}", enc(query))).await,
            [id(&matched)],
            "{name} / {query}"
        );
    }
}

#[tokio::test]
async fn list_sorts_by_difficulty_easy_to_hard() {
    let app = TestApp::new().await;
    for (name, difficulty) in [("h", "hard"), ("e", "easy"), ("m", "medium")] {
        app.note(json!({ "name": name, "difficulty": difficulty }))
            .await;
    }
    let order = |order: &'static str| {
        let app = &app;
        async move {
            names(
                &app.get(&format!("/api/notes/list?sort=difficulty&order={order}"))
                    .send()
                    .await
                    .ok()["items"],
            )
        }
    };
    assert_eq!(order("asc").await, ["e", "m", "h"]);
    assert_eq!(order("desc").await, ["h", "m", "e"]);
    let ids = app
        .get("/api/notes/ids?sort=difficulty&order=asc")
        .send()
        .await
        .ok();
    assert_eq!(ids["ids"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn list_excludes_deleted_notes_unless_asked() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    app.delete(&format!("/api/notes/{}", id(&note)))
        .send()
        .await;
    assert!(!app.listed("").await.contains(&id(&note)));
    assert!(app.listed("deleted=true").await.contains(&id(&note)));
}

#[tokio::test]
async fn update_note_changes_name_and_content() {
    let app = TestApp::new().await;
    let note = app
        .note(json!({ "name": "Old name", "content": "old" }))
        .await;
    let path = format!("/api/notes/{}", id(&note));
    let updated = app
        .patch(&path)
        .json(json!({ "name": "New name", "content": "new" }))
        .send()
        .await
        .ok();
    assert_eq!(updated["name"], "New name");
    assert_eq!(updated["content"], "new");
    assert_eq!(app.get(&path).send().await.ok()["name"], "New name");
}

#[tokio::test]
async fn update_deleted_note_404s() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let path = format!("/api/notes/{}", id(&note));
    app.delete(&path).send().await;
    let response = app
        .patch(&path)
        .json(json!({ "name": "x", "content": "y" }))
        .send()
        .await;
    assert_eq!(response.code(), 404);
}

#[tokio::test]
async fn delete_restore_and_permanently_delete() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let path = format!("/api/notes/{}", id(&note));
    assert_eq!(app.delete(&path).send().await.code(), 204);
    assert_eq!(app.get(&path).send().await.code(), 404);
    assert_eq!(
        app.patch(&format!("{path}/restore")).send().await.code(),
        200
    );
    assert_eq!(app.get(&path).send().await.code(), 200);
    assert_eq!(app.delete(&path).send().await.code(), 204);
    assert_eq!(
        app.delete(&format!("{path}/permanent")).send().await.code(),
        204
    );
    assert_eq!(
        app.patch(&format!("{path}/restore")).send().await.code(),
        404
    );
}

#[tokio::test]
async fn restore_a_note_that_was_never_deleted_404s() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let response = app
        .patch(&format!("/api/notes/{}/restore", id(&note)))
        .send()
        .await;
    assert_eq!(response.code(), 404);
}

#[tokio::test]
async fn empty_trash_permanently_deletes_every_trashed_note_only() {
    let app = TestApp::new().await;
    let trashed = app.named("Trashed").await;
    let kept = app.named("Kept").await;
    app.delete(&format!("/api/notes/{}", id(&trashed)))
        .send()
        .await;
    assert_eq!(app.delete("/api/notes/trash").send().await.code(), 204);
    assert_eq!(
        app.get(&format!("/api/notes/{}", id(&trashed)))
            .send()
            .await
            .code(),
        404
    );
    assert_eq!(
        app.get(&format!("/api/notes/{}", id(&kept)))
            .send()
            .await
            .code(),
        200
    );
}

#[tokio::test]
async fn attach_and_detach_a_regular_tag_idempotently() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let tag = app.tag("rust").await;
    let path = format!("/api/notes/{}/tags/{}", id(&note), id(&tag));
    let attached = app.post(&path).send().await.ok();
    assert!(names(&attached["tags"]).contains(&"rust".to_string()));
    let again = app.post(&path).send().await.ok();
    assert_eq!(
        names(&again["tags"])
            .iter()
            .filter(|n| *n == "rust")
            .count(),
        1
    );
    let detached = app.delete(&path).send().await.ok();
    assert!(!names(&detached["tags"]).contains(&"rust".to_string()));
}

#[tokio::test]
async fn attaching_or_detaching_a_difficulty_tag_directly_is_rejected() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let hard = app.tag_id("Hard").await;
    let medium = app.tag_id("Medium").await;
    let attach = app
        .post(&format!("/api/notes/{}/tags/{hard}", id(&note)))
        .send()
        .await;
    assert_eq!(attach.code(), 400);
    let detach = app
        .delete(&format!("/api/notes/{}/tags/{medium}", id(&note)))
        .send()
        .await;
    assert_eq!(detach.code(), 400);
}

#[tokio::test]
async fn set_difficulty_swaps_the_tag_and_syncs_ease_factor() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let body = app
        .patch(&format!("/api/notes/{}/difficulty", id(&note)))
        .json(json!({ "difficulty": "hard" }))
        .send()
        .await
        .ok();
    let difficulty: Vec<&str> = body["tags"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|t| t["is_difficulty"] == true)
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(difficulty, ["Hard"]);
    assert_eq!(body["ease_factor"], 1.8);
}

#[tokio::test]
async fn set_project_then_clear_it() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let project = app.project("P").await;
    let path = format!("/api/notes/{}/project", id(&note));
    let with = app
        .patch(&path)
        .json(json!({ "project_id": id(&project) }))
        .send()
        .await
        .ok();
    assert_eq!(with["project"]["name"], "P");
    let cleared = app
        .patch(&path)
        .json(json!({ "project_id": null }))
        .send()
        .await
        .ok();
    assert!(cleared["project"].is_null());
}

#[tokio::test]
async fn reschedule_pending_reminder_moves_it() {
    let app = TestApp::new().await;
    let note = app.named("n").await;
    let new_time = iso(now() + days(5));
    let body = app
        .patch(&format!("/api/notes/{}/reminders/pending", id(&note)))
        .json(json!({ "remind_at": new_time }))
        .send()
        .await
        .ok();
    assert_eq!(
        &body["reminders"][0]["remind_at"].as_str().unwrap()[..16],
        &new_time[..16]
    );
}

#[tokio::test]
async fn due_notes_only_returns_notes_whose_reminder_is_due() {
    let app = TestApp::new().await;
    let due = app.named("due").await;
    let later = app.named("later").await;
    app.patch(&format!("/api/notes/{}/reminders/pending", id(&later)))
        .json(json!({ "remind_at": iso(now() + days(30)) }))
        .send()
        .await
        .ok();
    let due_ids = app.due_ids().await;
    assert!(due_ids.contains(&id(&due)));
    assert!(!due_ids.contains(&id(&later)));
}

#[tokio::test]
async fn settings_default_to_fsrs_and_persist() {
    let app = TestApp::new().await;
    assert_eq!(
        app.get("/api/settings").send().await.ok(),
        json!({ "default_algorithm": "fsrs" })
    );
    let updated = app
        .patch("/api/settings")
        .json(json!({ "default_algorithm": "sm2" }))
        .send()
        .await
        .ok();
    assert_eq!(updated, json!({ "default_algorithm": "sm2" }));
    assert_eq!(
        app.get("/api/settings").send().await.ok(),
        json!({ "default_algorithm": "sm2" })
    );
}

#[tokio::test]
async fn updating_to_an_unknown_algorithm_422s() {
    let app = TestApp::new().await;
    let response = app
        .patch("/api/settings")
        .json(json!({ "default_algorithm": "not-a-real-one" }))
        .send()
        .await;
    assert_eq!(response.code(), 422);
}

#[tokio::test]
async fn new_notes_use_whatever_the_current_default_is() {
    let app = TestApp::new().await;
    app.use_sm2().await;
    let note = app.named("n").await;
    assert_eq!(note["algorithm"], "sm2");
    app.patch("/api/settings")
        .json(json!({ "default_algorithm": "fsrs" }))
        .send()
        .await
        .ok();
    assert_eq!(app.named("n2").await["algorithm"], "fsrs");
    let first = app
        .get(&format!("/api/notes/{}", id(&note)))
        .send()
        .await
        .ok();
    assert_eq!(first["algorithm"], "sm2");
}
