use std::time::Duration;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::client::{Remote, SyncError};
use crate::attachments::sniff;
use crate::error::{ApiError, ApiResult, Body, P};
use crate::state::AppState;

const MAX_HASHES: usize = 500;
const MAX_BLOB: usize = 25 * 1024 * 1024 + 1024;
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(180);
const DOWNLOADS_PER_SYNC: i64 = 100;

fn is_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

#[derive(Deserialize)]
struct Hashes {
    hashes: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct Missing {
    missing: Vec<String>,
    #[serde(default)]
    unknown: Vec<String>,
}

async fn missing(
    State(state): State<AppState>,
    Body(body): Body<Hashes>,
) -> ApiResult<Json<Missing>> {
    if body.hashes.len() > MAX_HASHES || !body.hashes.iter().all(|h| is_hash(h)) {
        return Err(ApiError::bad_request("Invalid hash list."));
    }
    let mut missing = vec![];
    let mut unknown = vec![];
    for hash in body.hashes {
        let (referenced, stored): (bool, bool) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM attachments WHERE hash = ?), EXISTS(SELECT 1 FROM attachment_blobs WHERE hash = ?)",
        )
        .bind(&hash)
        .bind(&hash)
        .fetch_one(&state.db)
        .await?;
        if !referenced {
            unknown.push(hash);
        } else if !stored {
            missing.push(hash);
        }
    }
    Ok(Json(Missing { missing, unknown }))
}

async fn put_blob(
    State(state): State<AppState>,
    P(hash): P<String>,
    body: Bytes,
) -> ApiResult<StatusCode> {
    if !is_hash(&hash) || hex::encode(Sha256::digest(&body)) != hash.to_lowercase() {
        return Err(ApiError::bad_request("The file does not match its hash."));
    }
    let (mime, limit) = sniff(&body)
        .ok_or_else(|| ApiError::new(StatusCode::UNSUPPORTED_MEDIA_TYPE, "Unsupported file."))?;
    if body.len() > limit {
        return Err(ApiError::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "File too large.",
        ));
    }
    let referenced: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM attachments WHERE hash = ?)")
            .bind(hash.to_lowercase())
            .fetch_one(&state.db)
            .await?;
    if !referenced {
        return Err(ApiError::not_found("No attachment uses this file."));
    }
    sqlx::query(
        "INSERT OR IGNORE INTO attachment_blobs (hash, mime, size, data) VALUES (?, ?, ?, ?)",
    )
    .bind(hash.to_lowercase())
    .bind(mime)
    .bind(body.len() as i64)
    .bind(body.as_ref())
    .execute(&state.db)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_blob(State(state): State<AppState>, P(hash): P<String>) -> ApiResult<Response> {
    if !is_hash(&hash) {
        return Err(ApiError::bad_request("Invalid hash."));
    }
    let data: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT data FROM attachment_blobs WHERE hash = ?")
            .bind(hash.to_lowercase())
            .fetch_optional(&state.db)
            .await?;
    let data = data.ok_or_else(|| ApiError::not_found("File not found"))?;
    let mut response = data.into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    Ok(response)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync/blobs/missing", post(missing))
        .route(
            "/sync/blobs/{hash}",
            get(get_blob)
                .put(put_blob)
                .layer(DefaultBodyLimit::max(MAX_BLOB)),
        )
}

pub async fn upload_missing(state: &AppState, remote: &Remote) -> Result<(), SyncError> {
    let candidates: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT b.hash FROM attachment_blobs b WHERE b.hash IN (SELECT hash FROM attachments) \
         AND b.hash NOT IN (SELECT hash FROM sync_blobs_sent)",
    )
    .fetch_all(&state.db)
    .await?;
    for chunk in candidates.chunks(MAX_HASHES) {
        let answer: Missing = remote
            .request(reqwest::Method::POST, "/api/sync/blobs/missing")
            .json(&serde_json::json!({ "hashes": chunk }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        for hash in chunk {
            if answer.unknown.contains(hash) {
                continue;
            }
            if answer.missing.contains(hash) {
                let data: Option<Vec<u8>> =
                    sqlx::query_scalar("SELECT data FROM attachment_blobs WHERE hash = ?")
                        .bind(hash)
                        .fetch_optional(&state.db)
                        .await?;
                let Some(data) = data else { continue };
                let sent = remote
                    .request(reqwest::Method::PUT, &format!("/api/sync/blobs/{hash}"))
                    .timeout(TRANSFER_TIMEOUT)
                    .body(data)
                    .send()
                    .await
                    .and_then(|r| r.error_for_status());
                if sent.is_err() {
                    continue;
                }
            }
            sqlx::query("INSERT OR IGNORE INTO sync_blobs_sent (hash) VALUES (?)")
                .bind(hash)
                .execute(&state.db)
                .await?;
        }
    }
    Ok(())
}

pub async fn download_missing(state: &AppState, remote: &Remote) -> Result<(), SyncError> {
    let wanted: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT hash FROM attachments WHERE hash NOT IN (SELECT hash FROM attachment_blobs) LIMIT ?",
    )
    .bind(DOWNLOADS_PER_SYNC)
    .fetch_all(&state.db)
    .await?;
    for hash in wanted {
        let Ok(response) = remote
            .request(reqwest::Method::GET, &format!("/api/sync/blobs/{hash}"))
            .timeout(TRANSFER_TIMEOUT)
            .send()
            .await
        else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let Ok(data) = response.bytes().await else {
            continue;
        };
        if hex::encode(Sha256::digest(&data)) != hash {
            continue;
        }
        let Some((mime, limit)) = sniff(&data) else {
            continue;
        };
        if data.len() > limit {
            continue;
        }
        sqlx::query(
            "INSERT OR IGNORE INTO attachment_blobs (hash, mime, size, data) VALUES (?, ?, ?, ?)",
        )
        .bind(&hash)
        .bind(mime)
        .bind(data.len() as i64)
        .bind(data.as_ref())
        .execute(&state.db)
        .await?;
        sqlx::query("INSERT OR IGNORE INTO sync_blobs_sent (hash) VALUES (?)")
            .bind(&hash)
            .execute(&state.db)
            .await?;
    }
    Ok(())
}
