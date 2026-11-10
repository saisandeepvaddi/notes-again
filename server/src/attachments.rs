use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::db::BEGIN_WRITE;
use crate::error::{ApiError, ApiResult, P};
use crate::notes::live_note;
use crate::state::AppState;
use crate::time::Ts;

const MAX_IMAGE: usize = 10 * 1024 * 1024;
const MAX_PDF: usize = 25 * 1024 * 1024;
const MAX_PER_NOTE: i64 = 20;
const MAX_NAME: usize = 120;

#[derive(Serialize, sqlx::FromRow)]
struct AttachmentResponse {
    uid: String,
    name: String,
    mime: String,
    size: i64,
    created_at: String,
}

pub fn sniff(data: &[u8]) -> Option<(&'static str, usize)> {
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("image/png", MAX_IMAGE))
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("image/jpeg", MAX_IMAGE))
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        Some(("image/gif", MAX_IMAGE))
    } else if data.len() > 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        Some(("image/webp", MAX_IMAGE))
    } else if data.starts_with(b"%PDF-") {
        Some(("application/pdf", MAX_PDF))
    } else {
        None
    }
}

pub fn valid_metadata(uid: &str, note: &str, mime: &str, hash: &str, size: i64) -> bool {
    let limit = match mime {
        "image/png" | "image/jpeg" | "image/gif" | "image/webp" => MAX_IMAGE,
        "application/pdf" => MAX_PDF,
        _ => return false,
    };
    let hex = |value: &str, len: usize| {
        value.len() == len && value.bytes().all(|b| b.is_ascii_hexdigit())
    };
    hex(uid, 32)
        && hex(hash, 64)
        && !note.is_empty()
        && note.len() <= 64
        && size >= 0
        && size as usize <= limit
}

pub fn clean_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '"' | '<' | '>' | ':' | '|' | '?' | '*'))
        .take(MAX_NAME)
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() {
        "attachment".into()
    } else {
        cleaned
    }
}

fn file_name(headers: &HeaderMap) -> String {
    let raw = headers
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let decoded = percent_decode(raw);
    clean_name(&decoded)
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Some(Ok(byte)) = raw.get(i + 1..i + 3).map(|h| u8::from_str_radix(h, 16))
        {
            out.push(byte);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

async fn upload(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<AttachmentResponse>)> {
    let (mime, limit) = sniff(&body).ok_or_else(|| {
        ApiError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Only PNG, JPEG, WebP, GIF and PDF files can be attached.",
        )
    })?;
    if body.len() > limit {
        return Err(ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            if mime == "application/pdf" {
                "PDFs can be up to 25 MB."
            } else {
                "Images can be up to 10 MB."
            },
        ));
    }
    let name = file_name(&headers);
    let hash = hex::encode(Sha256::digest(&body));
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let note = live_note(&mut tx, note_id).await?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM attachments WHERE note_uid = ?")
        .bind(&note.uid)
        .fetch_one(&mut *tx)
        .await?;
    if count >= MAX_PER_NOTE {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "A note can have up to 20 attachments.",
        ));
    }
    sqlx::query(
        "INSERT OR IGNORE INTO attachment_blobs (hash, mime, size, data) VALUES (?, ?, ?, ?)",
    )
    .bind(&hash)
    .bind(mime)
    .bind(body.len() as i64)
    .bind(body.as_ref())
    .execute(&mut *tx)
    .await?;
    let uid = crate::db::models::new_uid();
    let created = Ts::now();
    sqlx::query(
        "INSERT INTO attachments (uid, note_uid, name, mime, size, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&uid)
    .bind(&note.uid)
    .bind(&name)
    .bind(mime)
    .bind(body.len() as i64)
    .bind(&hash)
    .bind(created)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(AttachmentResponse {
            uid,
            name,
            mime: mime.into(),
            size: body.len() as i64,
            created_at: created.iso(),
        }),
    ))
}

async fn list(
    State(state): State<AppState>,
    P(note_id): P<i64>,
) -> ApiResult<Json<Vec<AttachmentResponse>>> {
    let mut conn = state.db.acquire().await?;
    let note = live_note(&mut conn, note_id).await?;
    let rows = sqlx::query_as(
        "SELECT uid, name, mime, size, created_at FROM attachments WHERE note_uid = ? ORDER BY id",
    )
    .bind(&note.uid)
    .fetch_all(&mut *conn)
    .await?;
    Ok(Json(rows))
}

async fn file(State(state): State<AppState>, P(uid): P<String>) -> ApiResult<Response> {
    let row: Option<(String, String, Vec<u8>)> = sqlx::query_as(
        "SELECT a.name, b.mime, b.data FROM attachments a JOIN attachment_blobs b ON b.hash = a.hash JOIN notes n ON n.uid = a.note_uid WHERE a.uid = ? AND n.deleted_at IS NULL",
    )
    .bind(&uid)
    .fetch_optional(&state.db)
    .await?;
    let (name, mime, data) = row.ok_or_else(|| ApiError::not_found("Attachment not found"))?;
    let kind = if mime == "application/pdf" {
        "attachment"
    } else {
        "inline"
    };
    let disposition = format!("{kind}; filename=\"{}\"", name.replace(['\\', '"'], ""));
    let mut response = data.into_response();
    let headers = response.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap());
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition).unwrap_or_else(|_| HeaderValue::from_static("inline")),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        ),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=3600"),
    );
    Ok(response)
}

async fn remove(State(state): State<AppState>, P(uid): P<String>) -> ApiResult<StatusCode> {
    let result = sqlx::query("DELETE FROM attachments WHERE uid = ?")
        .bind(&uid)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("Attachment not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/notes/{note_id}/attachments",
            post(upload)
                .layer(DefaultBodyLimit::max(MAX_PDF + 1024))
                .get(list),
        )
        .route("/attachments/{uid}/file", get(file))
        .route("/attachments/{uid}", delete(remove))
}

#[cfg(test)]
mod tests {
    use super::*;

    const UID: &str = "0123456789abcdef0123456789abcdef";

    fn hash() -> String {
        "a".repeat(64)
    }

    #[test]
    fn synced_metadata_must_describe_an_allowed_file() {
        assert!(valid_metadata(UID, "note", "image/png", &hash(), 10));
        assert!(valid_metadata(
            UID,
            "note",
            "application/pdf",
            &hash(),
            25 * 1024 * 1024
        ));
        for (uid, note, mime, hash_value, size) in [
            ("short", "note", "image/png", hash(), 10),
            (UID, "", "image/png", hash(), 10),
            (UID, "note", "image/svg+xml", hash(), 10),
            (UID, "note", "text/html", hash(), 10),
            (UID, "note", "image/png", "zz".repeat(32), 10),
            (UID, "note", "image/png", hash(), -1),
            (UID, "note", "image/png", hash(), 10 * 1024 * 1024 + 1),
            (UID, "note", "application/pdf", hash(), 25 * 1024 * 1024 + 1),
        ] {
            assert!(
                !valid_metadata(uid, note, mime, &hash_value, size),
                "{mime} {size}"
            );
        }
    }

    #[test]
    fn names_lose_paths_and_control_characters() {
        assert_eq!(clean_name("../../etc/passwd"), "passwd");
        assert_eq!(clean_name("C:\\dir\\file.pdf"), "file.pdf");
        assert_eq!(clean_name(".hidden"), "hidden");
        assert_eq!(clean_name("a\u{0}b\"c.png"), "abc.png");
        assert_eq!(clean_name(""), "attachment");
        assert_eq!(clean_name(&"x".repeat(500)).len(), 120);
    }
}
