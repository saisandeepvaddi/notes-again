mod common;

use common::*;

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
