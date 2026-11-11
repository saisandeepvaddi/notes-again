mod common;

use common::*;
use notes_again_server::attachments;

const PDF: &str = "%PDF-1.4 test document";
const GIF: &str = "GIF89a-pixels";

async fn upload(app: &TestApp, note: i64, name: &str, body: &str) -> Res {
    app.post(&format!("/api/notes/{note}/attachments"))
        .header("x-file-name", name)
        .raw("application/octet-stream", body)
        .send()
        .await
}

async fn count(app: &TestApp, table: &str) -> i64 {
    app.scalar_i64(&format!("SELECT COUNT(*) FROM {table}"))
        .await
}

#[tokio::test]
async fn uploads_are_identified_by_content_and_served_safely() {
    let app = TestApp::new().await;
    let note = id(&app.named("n").await);
    let created = upload(&app, note, "../../evil%20name.exe", PDF).await;
    assert_eq!(created.code(), 201);
    let body = created.json();
    assert_eq!(body["mime"], "application/pdf");
    assert_eq!(body["name"], "evil name.exe");
    let uid = body["uid"].as_str().unwrap();

    let file = app
        .get(&format!("/api/attachments/{uid}/file"))
        .send()
        .await;
    assert_eq!(file.code(), 200);
    assert_eq!(file.text(), PDF);
    assert_eq!(
        file.header("content-type").as_deref(),
        Some("application/pdf")
    );
    assert_eq!(
        file.header("x-content-type-options").as_deref(),
        Some("nosniff")
    );
    assert!(
        file.header("content-security-policy")
            .unwrap()
            .contains("sandbox")
    );

    assert!(
        file.header("content-disposition")
            .unwrap()
            .starts_with("attachment;")
    );
    let listed = app
        .get(&format!("/api/notes/{note}/attachments"))
        .send()
        .await
        .ok();
    assert_eq!(listed.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn unsupported_empty_and_script_content_is_rejected() {
    let app = TestApp::new().await;
    let note = id(&app.named("n").await);
    for body in [
        "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
        "<html><script>1</script></html>",
        "plain text",
        "",
    ] {
        assert_eq!(
            upload(&app, note, "x.png", body).await.code(),
            415,
            "{body}"
        );
    }
    assert_eq!(count(&app, "attachments").await, 0);
    assert_eq!(count(&app, "attachment_blobs").await, 0);
}

#[tokio::test]
async fn size_and_count_limits_apply() {
    let app = TestApp::new().await;
    let note = id(&app.named("n").await);
    let big_image = format!("GIF89a{}", "x".repeat(10 * 1024 * 1024));
    assert_eq!(upload(&app, note, "big.gif", &big_image).await.code(), 413);
    for n in 0..20 {
        assert_eq!(
            upload(&app, note, &format!("{n}.gif"), &format!("{GIF}{n}"))
                .await
                .code(),
            201
        );
    }
    assert_eq!(
        upload(&app, note, "21.gif", "GIF89a-extra").await.code(),
        422
    );
    assert_eq!(upload(&app, 9999, "a.gif", GIF).await.code(), 404);
}

#[tokio::test]
async fn identical_files_share_one_blob_until_the_last_reference_goes() {
    let app = TestApp::new().await;
    let first = id(&app.named("a").await);
    let second = id(&app.named("b").await);
    let one = upload(&app, first, "a.gif", GIF).await.json();
    let two = upload(&app, second, "b.gif", GIF).await.json();
    assert_eq!(count(&app, "attachment_blobs").await, 1);
    let uid = one["uid"].as_str().unwrap();
    assert_eq!(
        app.delete(&format!("/api/attachments/{uid}"))
            .send()
            .await
            .code(),
        204
    );
    assert_eq!(count(&app, "attachment_blobs").await, 1);
    let other = two["uid"].as_str().unwrap();
    assert_eq!(
        app.delete(&format!("/api/attachments/{other}"))
            .send()
            .await
            .code(),
        204
    );
    assert_eq!(count(&app, "attachment_blobs").await, 0);
    assert_eq!(
        app.delete(&format!("/api/attachments/{other}"))
            .send()
            .await
            .code(),
        404
    );
}

#[tokio::test]
async fn trash_hides_files_and_permanent_delete_removes_them() {
    let app = TestApp::new().await;
    let note = id(&app.named("n").await);
    let uid = upload(&app, note, "a.gif", GIF).await.json()["uid"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        app.delete(&format!("/api/notes/{note}"))
            .send()
            .await
            .code(),
        204
    );
    assert_eq!(
        app.get(&format!("/api/attachments/{uid}/file"))
            .send()
            .await
            .code(),
        404
    );
    assert_eq!(count(&app, "attachments").await, 1);
    app.patch(&format!("/api/notes/{note}/restore"))
        .send()
        .await;
    assert_eq!(
        app.get(&format!("/api/attachments/{uid}/file"))
            .send()
            .await
            .code(),
        200
    );
    app.delete(&format!("/api/notes/{note}")).send().await;
    assert_eq!(
        app.delete(&format!("/api/notes/{note}/permanent"))
            .send()
            .await
            .code(),
        204
    );
    assert_eq!(count(&app, "attachments").await, 0);
    assert_eq!(count(&app, "attachment_blobs").await, 0);
}

async fn old(app: &TestApp) {
    app.exec("UPDATE attachments SET created_at = '2000-01-01 00:00:00.000000'")
        .await;
}

#[tokio::test]
async fn unreferenced_attachments_are_removed_after_a_grace_period() {
    let app = TestApp::new().await;
    let note = id(&app.named("n").await);
    let kept = upload(&app, note, "kept.gif", GIF).await.json()["uid"]
        .as_str()
        .unwrap()
        .to_string();
    let unused = upload(&app, note, "unused.pdf", PDF).await.json()["uid"]
        .as_str()
        .unwrap()
        .to_string();
    let past = upload(&app, note, "past.gif", "GIF89a-past").await.json()["uid"]
        .as_str()
        .unwrap()
        .to_string();
    app.patch(&format!("/api/notes/{note}"))
        .json(json!({ "name": "n", "content": format!("![x](attachment:{past})") }))
        .send()
        .await;
    app.exec("UPDATE note_revisions SET created_at = '2000-01-01 00:00:00.000000'")
        .await;
    app.patch(&format!("/api/notes/{note}"))
        .json(json!({ "name": "n", "content": format!("![x](attachment:{kept})") }))
        .send()
        .await;

    assert_eq!(attachments::cleanup(&app.state.db).await.unwrap(), 0);
    old(&app).await;
    assert_eq!(attachments::cleanup(&app.state.db).await.unwrap(), 1);
    assert_eq!(
        app.get(&format!("/api/attachments/{unused}/file"))
            .send()
            .await
            .code(),
        404
    );
    assert_eq!(
        app.get(&format!("/api/attachments/{kept}/file"))
            .send()
            .await
            .code(),
        200
    );
    assert_eq!(
        app.get(&format!("/api/attachments/{past}/file"))
            .send()
            .await
            .code(),
        200,
        "still referenced by an earlier revision"
    );
}

#[tokio::test]
async fn archive_bundles_the_note_with_relative_attachment_links() {
    let app = TestApp::new().await;
    assert_eq!(app.get("/api/notes/9999/archive").send().await.code(), 404);
    let note = id(&app.named("Plain").await);
    assert_eq!(
        app.get(&format!("/api/notes/{note}/archive"))
            .send()
            .await
            .code(),
        404
    );
    let uid = upload(&app, note, "my paper.pdf", PDF).await.json()["uid"]
        .as_str()
        .unwrap()
        .to_string();
    app.patch(&format!("/api/notes/{note}"))
        .json(json!({ "name": "Plain", "content": format!("[my paper.pdf](attachment:{uid})") }))
        .send()
        .await;
    let response = app.get(&format!("/api/notes/{note}/archive")).send().await;
    assert_eq!(response.code(), 200);
    assert_eq!(
        response.header("content-type").as_deref(),
        Some("application/zip")
    );
    assert!(
        response
            .header("content-disposition")
            .unwrap()
            .contains(".zip")
    );
    let body = response.text();
    assert!(body.starts_with("PK"));
    assert!(body.contains(&format!("](attachments/{}-my%20paper.pdf)", &uid[..8])));
    assert!(!body.contains("attachment:"));
    assert!(body.contains(PDF));
    assert!(body.contains(&format!("attachments/{}-my paper.pdf", &uid[..8])));
}

#[tokio::test]
async fn backups_carry_attachments_and_restore_serves_them() {
    let app = TestApp::new().await;
    let note = id(&app.named("n").await);
    let uid = upload(&app, note, "a.pdf", PDF).await.json()["uid"]
        .as_str()
        .unwrap()
        .to_string();
    let target = app.path("snapshot.db");
    notes_again_server::backups::copy_database(&app.state.db, &target)
        .await
        .unwrap();
    let restored = app.path("restored.db");
    notes_again_server::backups::restore_database(&target, &restored)
        .await
        .unwrap();
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .connect_with(sqlx::sqlite::SqliteConnectOptions::new().filename(&restored))
        .await
        .unwrap();
    let data: Vec<u8> = sqlx::query_scalar(
        "SELECT b.data FROM attachments a JOIN attachment_blobs b ON b.hash = a.hash WHERE a.uid = ?",
    )
    .bind(&uid)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(data, PDF.as_bytes());
}
