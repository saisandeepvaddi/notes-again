use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{delete, get, post};
use axum::{Extension, Json, Router};
use chrono::Duration;
use serde::{Deserialize, Serialize};

use super::Identity;
use super::secrets::{sha256_hex, token_urlsafe};
use crate::db::models::ApiTokenRow;
use crate::db::{BEGIN_WRITE, Conn};
use crate::error::{ApiError, ApiResult, Body, P};
use crate::params::{check_len, check_range};
use crate::state::AppState;
use crate::time::Ts;

pub const TOKEN_PREFIX: &str = "nal_";
pub const CAPTURE_SCOPE: &str = "capture";
pub const APP_SCOPE: &str = "app";

const CAPTURE_ROUTES: [(&str, &str); 5] = [
    ("GET", "/api/projects/list"),
    ("GET", "/api/tags/list"),
    ("POST", "/api/projects/create"),
    ("POST", "/api/tags/create"),
    ("POST", "/api/notes/create"),
];

const TOKEN_COLUMNS: &str = "id, name, token_hash, prefix, scope, created_by, created_at, last_used_at, expires_at, revoked_at";

pub fn generate_token() -> String {
    format!("{TOKEN_PREFIX}{}", token_urlsafe(32))
}

pub fn display_prefix(token: &str) -> String {
    token.chars().take(TOKEN_PREFIX.len() + 6).collect()
}

pub fn scope_allows(scope: &str, method: &str, path: &str) -> bool {
    if scope == APP_SCOPE {
        return true;
    }
    if scope != CAPTURE_SCOPE {
        return false;
    }
    let trimmed = path.trim_end_matches('/');
    let path = if trimmed.is_empty() { "/" } else { trimmed };
    let method = method.to_uppercase();
    CAPTURE_ROUTES
        .iter()
        .any(|(m, p)| *m == method && *p == path)
        || (method == "POST" && is_note_attachment_path(path))
}

fn is_note_attachment_path(path: &str) -> bool {
    path.strip_prefix("/api/notes/")
        .and_then(|rest| rest.strip_suffix("/attachments"))
        .is_some_and(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
}

pub async fn find_active(conn: &mut Conn, token: &str) -> Result<Option<ApiTokenRow>, sqlx::Error> {
    let record: Option<ApiTokenRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {TOKEN_COLUMNS} FROM api_tokens WHERE token_hash = ?"
    )))
    .bind(sha256_hex(token))
    .fetch_optional(&mut *conn)
    .await?;
    Ok(record.filter(|r| r.revoked_at.is_none() && r.expires_at.is_none_or(|exp| exp > Ts::now())))
}

pub async fn record_use(conn: &mut Conn, record: &ApiTokenRow) -> Result<(), sqlx::Error> {
    let now = Ts::now();
    let stale = record
        .last_used_at
        .is_none_or(|last| now.since(last) > Duration::minutes(5));
    if stale {
        sqlx::query("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
            .bind(now)
            .bind(record.id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

pub async fn issue(
    conn: &mut Conn,
    name: &str,
    scope: &str,
    created_by: Option<&str>,
    expires_in_days: Option<i64>,
) -> Result<CreatedToken, sqlx::Error> {
    let token = generate_token();
    let now = Ts::now();
    let expires_at = expires_in_days
        .filter(|d| *d != 0)
        .map(|days| now.plus(Duration::days(days)));
    let id = sqlx::query(
        "INSERT INTO api_tokens (name, token_hash, prefix, scope, created_by, created_at, expires_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(name)
    .bind(sha256_hex(&token))
    .bind(display_prefix(&token))
    .bind(scope)
    .bind(created_by)
    .bind(now)
    .bind(expires_at)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();
    Ok(CreatedToken {
        info: TokenResponse {
            id,
            name: name.to_string(),
            prefix: display_prefix(&token),
            scope: scope.to_string(),
            created_at: now,
            last_used_at: None,
            expires_at,
        },
        token,
    })
}

pub async fn revoke(conn: &mut Conn, id: i64) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE api_tokens SET revoked_at = ? WHERE id = ?")
        .bind(Ts::now())
        .bind(id)
        .execute(conn)
        .await?;
    Ok(())
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub id: i64,
    pub name: String,
    pub prefix: String,
    pub scope: String,
    pub created_at: Ts,
    pub last_used_at: Option<Ts>,
    pub expires_at: Option<Ts>,
}

impl From<ApiTokenRow> for TokenResponse {
    fn from(row: ApiTokenRow) -> Self {
        TokenResponse {
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            scope: row.scope,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
            expires_at: row.expires_at,
        }
    }
}

#[derive(Serialize)]
pub struct CreatedToken {
    #[serde(flatten)]
    pub info: TokenResponse,
    pub token: String,
}

async fn list_tokens(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
) -> ApiResult<Json<Vec<TokenResponse>>> {
    identity.require_session()?;
    let rows: Vec<ApiTokenRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {TOKEN_COLUMNS} FROM api_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC"
    )))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows.into_iter().map(TokenResponse::from).collect()))
}

#[derive(Deserialize)]
struct NewTokenBody {
    name: String,
    #[serde(default)]
    expires_in_days: Option<i64>,
    #[serde(default = "default_scope")]
    scope: Scope,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
enum Scope {
    Capture,
    App,
}

fn default_scope() -> Scope {
    Scope::Capture
}

async fn create_token(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
    Body(body): Body<NewTokenBody>,
) -> ApiResult<Json<CreatedToken>> {
    identity.require_session()?;
    check_len("name", &body.name, 80)?;
    if let Some(days) = body.expires_in_days {
        check_range("expires_in_days", days, 1, 3650)?;
    }
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("Token name cannot be empty"));
    }
    let scope = match body.scope {
        Scope::Capture => CAPTURE_SCOPE,
        Scope::App => APP_SCOPE,
    };
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let created = issue(
        &mut tx,
        name,
        scope,
        identity.email.as_deref(),
        body.expires_in_days,
    )
    .await?;
    tx.commit().await?;
    Ok(Json(created))
}

async fn revoke_token(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
    P(token_id): P<i64>,
) -> ApiResult<StatusCode> {
    identity.require_session()?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let revoked: Option<Option<Ts>> =
        sqlx::query_scalar("SELECT revoked_at FROM api_tokens WHERE id = ?")
            .bind(token_id)
            .fetch_optional(&mut *tx)
            .await?;
    if !matches!(revoked, Some(None)) {
        return Err(ApiError::not_found("Token not found"));
    }
    revoke(&mut tx, token_id).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tokens/list", get(list_tokens))
        .route("/tokens/create", post(create_token))
        .route("/tokens/{token_id}", delete(revoke_token))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_scope_is_narrow() {
        assert!(scope_allows("capture", "post", "/api/notes/create/"));
        assert!(!scope_allows("capture", "GET", "/api/notes/list"));
        assert!(scope_allows("capture", "POST", "/api/notes/12/attachments"));
        assert!(!scope_allows("capture", "GET", "/api/notes/12/attachments"));
        assert!(!scope_allows("capture", "POST", "/api/notes/x/attachments"));
        assert!(!scope_allows("capture", "DELETE", "/api/notes/12"));
        assert!(scope_allows("app", "DELETE", "/api/notes/1"));
        assert!(!scope_allows("other", "GET", "/api/tags/list"));
    }
}
