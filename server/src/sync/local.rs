use std::time::Duration;

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::Duration as ChronoDuration;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::client::{Remote, SyncError, describe_error, resolve_conflict, run_sync};
use super::payloads::current_version;
use crate::config::AuthMode;
use crate::db::BEGIN_WRITE;
use crate::db::models::SyncRemoteRow;
use crate::error::{ApiError, ApiResult, Body, P};
use crate::params::{check_len, check_opt_len};
use crate::state::AppState;
use crate::time::Ts;

const CHECK_EVERY: Duration = Duration::from_secs(10);
const PULL_EVERY_SECONDS: i64 = 60;
const VERIFY_SINCE: i64 = 1 << 62;

#[derive(Serialize, Default)]
struct SyncStatus {
    connected: bool,
    url: Option<String>,
    username: Option<String>,
    syncing: bool,
    pending: bool,
    conflicts: i64,
    last_synced_at: Option<Ts>,
    last_changed_at: Option<Ts>,
    last_error: Option<String>,
}

async fn remote(state: &AppState) -> Result<Option<SyncRemoteRow>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM sync_remote WHERE id = 1")
        .fetch_optional(&state.db)
        .await
}

async fn status(state: &AppState) -> Result<SyncStatus, sqlx::Error> {
    let Some(row) = remote(state).await? else {
        return Ok(SyncStatus::default());
    };
    let mut conn = state.db.acquire().await?;
    let version = current_version(&mut conn).await?;
    let conflicts: i64 = sqlx::query_scalar("SELECT count(*) FROM sync_conflicts")
        .fetch_one(&mut *conn)
        .await?;
    Ok(SyncStatus {
        connected: true,
        url: Some(row.url),
        username: row.username,
        syncing: state.syncing(),
        pending: version > row.pushed_version,
        conflicts,
        last_synced_at: row.last_synced_at,
        last_changed_at: row.last_changed_at,
        last_error: row.last_error,
    })
}

async fn sync_due(state: &AppState) -> Result<bool, sqlx::Error> {
    let Some(row) = remote(state).await? else {
        return Ok(false);
    };
    let mut conn = state.db.acquire().await?;
    if current_version(&mut conn).await? > row.pushed_version {
        return Ok(true);
    }
    Ok(match row.last_synced_at {
        None => true,
        Some(last) => Ts::now().since(last) >= ChronoDuration::seconds(PULL_EVERY_SECONDS),
    })
}

pub async fn run_schedule(state: AppState) {
    loop {
        if !state.syncing() {
            match sync_due(&state).await {
                Ok(true) => run_sync(&state).await,
                Ok(false) => {}
                Err(error) => tracing::error!("Background sync failed: {error}"),
            }
        }
        tokio::time::sleep(CHECK_EVERY).await;
    }
}

fn sync_in_background(state: &AppState) {
    let state = state.clone();
    tokio::spawn(async move { run_sync(&state).await });
}

async fn sync_status(State(state): State<AppState>) -> ApiResult<Json<SyncStatus>> {
    Ok(Json(status(&state).await?))
}

#[derive(Deserialize)]
struct ConnectBody {
    url: String,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    token: Option<String>,
}

fn normalize_url(raw: &str) -> String {
    let mut url = raw.trim().trim_end_matches('/').to_string();
    if let Some(stripped) = url.strip_suffix("/api") {
        url = stripped.to_string();
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        url = format!("https://{url}");
    }
    url
}

const DEVICE_NAME_LIMIT: usize = 80;

fn device_name_for(host: &str) -> String {
    let host = host.trim().trim_end_matches(".local");
    let name = if host.is_empty() {
        "Desktop app".to_string()
    } else {
        format!("Desktop app ({host})")
    };
    if crate::text::char_len(&name) <= DEVICE_NAME_LIMIT {
        return name;
    }
    format!(
        "{})",
        crate::text::take_chars(&name, DEVICE_NAME_LIMIT - 2).trim_end()
    )
}

fn device_name() -> String {
    device_name_for(&gethostname::gethostname().to_string_lossy())
}

async fn exchange_password(url: &str, username: &str, password: &str) -> Result<String, ApiError> {
    let remote = Remote::new(url, None);
    let response = remote
        .request(reqwest::Method::POST, "/api/auth/token")
        .json(&json!({ "username": username, "password": password, "device_name": device_name() }))
        .send()
        .await
        .map_err(|e| ApiError::bad_request(describe_error(url, &SyncError::from(e))))?;
    match response.status().as_u16() {
        401 => return Err(ApiError::bad_request("Wrong username or password.")),
        409 => {
            return Err(ApiError::bad_request(
                "This server doesn't use a username and password. Create an app token in its Settings > API tokens and paste it here.",
            ));
        }
        429 => {
            return Err(ApiError::bad_request(
                "Too many failed attempts. Try again in a few minutes.",
            ));
        }
        _ => {}
    }
    let body: serde_json::Value = response
        .error_for_status()
        .map_err(|e| ApiError::bad_request(describe_error(url, &SyncError::from(e))))?
        .json()
        .await
        .map_err(|e| ApiError::bad_request(e.to_string()))?;
    body["token"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| ApiError::bad_request("The server didn't return a token."))
}

async fn verify(url: &str, token: &str) -> Result<(), ApiError> {
    let remote = Remote::new(url, Some(token));
    let response = remote
        .request(reqwest::Method::GET, "/api/sync/pull")
        .query(&[("since", VERIFY_SINCE), ("limit", 1)])
        .send()
        .await
        .map_err(|e| ApiError::bad_request(describe_error(url, &SyncError::from(e))))?;
    match response.status().as_u16() {
        401 => Err(ApiError::bad_request(
            "The server didn't accept that token.",
        )),
        403 => Err(ApiError::bad_request(
            "That token can only capture notes. Create an app token on the server.",
        )),
        404 => Err(ApiError::bad_request(
            "This server doesn't support sync yet. Update it to the latest Notes Again.",
        )),
        code if code >= 400 => Err(ApiError::bad_request(describe_error(
            url,
            &SyncError::Status(code),
        ))),
        _ => Ok(()),
    }
}

async fn connect(
    State(state): State<AppState>,
    Body(body): Body<ConnectBody>,
) -> ApiResult<Json<SyncStatus>> {
    check_len("url", &body.url, 500)?;
    check_opt_len("username", body.username.as_deref(), 100)?;
    check_opt_len("password", body.password.as_deref(), 500)?;
    check_opt_len("token", body.token.as_deref(), 500)?;
    if remote(&state).await?.is_some() {
        return Err(ApiError::conflict(
            "Disconnect from the current server first.",
        ));
    }
    let url = normalize_url(&body.url);
    let mut token = body.token.clone().unwrap_or_default().trim().to_string();
    let used_password = token.is_empty();
    if used_password {
        let (Some(username), Some(password)) = (
            body.username.as_deref().filter(|u| !u.is_empty()),
            body.password.as_deref().filter(|p| !p.is_empty()),
        ) else {
            return Err(ApiError::bad_request(
                "Enter a username and password, or an app token.",
            ));
        };
        token = exchange_password(&url, username.trim(), password).await?;
    }
    verify(&url, &token).await?;
    let username = if used_password {
        body.username.as_deref().map(|u| u.trim().to_string())
    } else {
        None
    };
    sqlx::query(
        "INSERT INTO sync_remote (id, url, token, username, pushed_version, pulled_version, created_at) \
         VALUES (1, ?, ?, ?, 0, 0, ?)",
    )
    .bind(&url)
    .bind(&token)
    .bind(username)
    .bind(Ts::now())
    .execute(&state.db)
    .await?;
    sync_in_background(&state);
    Ok(Json(status(&state).await?))
}

async fn disconnect(State(state): State<AppState>) -> ApiResult<StatusCode> {
    let Some(row) = remote(&state).await? else {
        return Ok(StatusCode::NO_CONTENT);
    };
    if row.username.is_some() {
        let client = Remote::new(&row.url, Some(&row.token));
        if let Err(error) = client
            .request(reqwest::Method::DELETE, "/api/auth/token")
            .send()
            .await
        {
            tracing::info!("Couldn't revoke the sync token on {}: {error}", row.url);
        }
    }
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    sqlx::query("DELETE FROM sync_remote")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM sync_bases")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM sync_conflicts")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn run_now(State(state): State<AppState>) -> ApiResult<Json<SyncStatus>> {
    run_sync(&state).await;
    Ok(Json(status(&state).await?))
}

#[derive(Serialize)]
struct ConflictResponse {
    note_id: i64,
    name: String,
    content: String,
    their_name: String,
    their_content: String,
    detected_at: Ts,
}

async fn list_conflicts(State(state): State<AppState>) -> ApiResult<Json<Vec<ConflictResponse>>> {
    let rows: Vec<(i64, String, String, String, String, Ts)> = sqlx::query_as(
        "SELECT notes.id, notes.name, notes.content, sync_conflicts.their_name, sync_conflicts.their_content, \
         sync_conflicts.detected_at FROM sync_conflicts JOIN notes ON notes.uid = sync_conflicts.note_uid",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        rows.into_iter()
            .map(
                |(note_id, name, content, their_name, their_content, detected_at)| {
                    ConflictResponse {
                        note_id,
                        name,
                        content,
                        their_name,
                        their_content,
                        detected_at,
                    }
                },
            )
            .collect(),
    ))
}

#[derive(Deserialize)]
struct ResolveBody {
    name: String,
    content: String,
}

async fn resolve(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Body(body): Body<ResolveBody>,
) -> ApiResult<StatusCode> {
    let uid: Option<String> = sqlx::query_scalar("SELECT uid FROM notes WHERE id = ?")
        .bind(note_id)
        .fetch_optional(&state.db)
        .await?;
    let resolved = match uid {
        Some(uid) => resolve_conflict(&state, &uid, &body.name, &body.content).await?,
        None => false,
    };
    if !resolved {
        return Err(ApiError::not_found("No conflict for this note"));
    }
    sync_in_background(&state);
    Ok(StatusCode::NO_CONTENT)
}

async fn require_desktop(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if state.config.auth_mode != AuthMode::Desktop {
        return ApiError::not_found("Not found").into_response();
    }
    next.run(request).await
}

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/sync/status", get(sync_status))
        .route("/sync/remote", put(connect).delete(disconnect))
        .route("/sync/run", post(run_now))
        .route("/sync/conflicts", get(list_conflicts))
        .route("/sync/conflicts/{note_id}/resolve", post(resolve))
        .route_layer(axum::middleware::from_fn_with_state(state, require_desktop))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_names_fit_the_servers_limit() {
        assert_eq!(device_name_for("laptop.local"), "Desktop app (laptop)");
        assert_eq!(device_name_for(""), "Desktop app");
        let long = "sjc22-bt115_6b0cb7b5-2bb7-4f05-8c7b-71b2d2ebfd38-1C8C2E7C0A9A.local";
        let name = device_name_for(long);
        assert!(crate::text::char_len(&name) <= DEVICE_NAME_LIMIT, "{name}");
        assert!(name.starts_with("Desktop app (sjc22-") && name.ends_with(')'));
    }
}
