use std::sync::LazyLock;
use std::time::{Duration as StdDuration, Instant};

use axum::extract::State;
use axum::http::header::{LOCATION, SET_COOKIE};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use chrono::Duration;
use serde::{Deserialize, Serialize};

use super::request::{RequestMeta, cookie, delete_cookie, set_cookie};
use super::secrets::{
    MIN_PASSWORD_LENGTH, generate_password, hash_password, sha256_hex, token_urlsafe,
    verify_password,
};
use super::{DESKTOP_COOKIE, tokens};
use crate::config::{AuthMode, FirebaseWebConfig};
use crate::db::models::LocalAuthRow;
use crate::db::{BEGIN_WRITE, Conn, Pool};
use crate::error::{ApiError, ApiResult, Body, Q};
use crate::params::{check_len, check_opt_len};
use crate::state::AppState;
use crate::time::Ts;

pub const DEFAULT_USERNAME: &str = "admin";
pub const SESSION_COOKIE: &str = "notes_again_session";
const COOKIE_MAX_AGE: i64 = 400 * 24 * 60 * 60;
const MAX_FAILED_LOGINS: usize = 5;
const FAILED_LOGIN_WINDOW: StdDuration = StdDuration::from_secs(15 * 60);

static DUMMY_HASH: LazyLock<String> = LazyLock::new(|| hash_password(&token_urlsafe(16)));

const LOCAL_COLUMNS: &str =
    "id, username, password_hash, enabled, setup_completed, initial_password, updated_at";

pub async fn get_local_auth(conn: &mut Conn) -> Result<Option<LocalAuthRow>, sqlx::Error> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {LOCAL_COLUMNS} FROM local_auth WHERE id = 1"
    )))
    .fetch_optional(conn)
    .await
}

fn print_first_launch_banner(record: &LocalAuthRow) {
    let line = "=".repeat(64);
    tracing::warn!(
        "\n{line}\nNotes Again: first launch. Sign in with\n  username: {}\n  password: {}\n\
         You'll be asked to change these, or turn login off, after signing in.\n{line}",
        record.username,
        record.initial_password.as_deref().unwrap_or("")
    );
}

pub async fn ensure_local_auth(state: &AppState) -> Result<(), sqlx::Error> {
    let mut conn = state.db.acquire().await?;
    let record = match get_local_auth(&mut conn).await? {
        Some(record) => record,
        None => {
            let username = if state.config.admin_username.is_empty() {
                DEFAULT_USERNAME.to_string()
            } else {
                state.config.admin_username.clone()
            };
            let password = state.config.admin_password.clone();
            let (hash, initial, completed) = if password.is_empty() {
                let initial = generate_password();
                (hash_password(&initial), Some(initial), false)
            } else {
                (hash_password(&password), None, true)
            };
            sqlx::query(
                "INSERT INTO local_auth (id, username, password_hash, enabled, setup_completed, initial_password, updated_at) \
                 VALUES (1, ?, ?, 1, ?, ?, ?)",
            )
            .bind(&username)
            .bind(hash)
            .bind(completed)
            .bind(&initial)
            .bind(Ts::now())
            .execute(&mut *conn)
            .await?;
            get_local_auth(&mut conn).await?.expect("just inserted")
        }
    };
    if !record.setup_completed && record.initial_password.is_some() {
        print_first_launch_banner(&record);
    }
    Ok(())
}

pub async fn reset_local_auth(pool: &Pool) -> Result<LocalAuthRow, sqlx::Error> {
    let initial = generate_password();
    let mut tx = pool.begin_with(BEGIN_WRITE).await?;
    sqlx::query(
        "INSERT INTO local_auth (id, username, password_hash, enabled, setup_completed, initial_password, updated_at) \
         VALUES (1, ?, ?, 1, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, \
         password_hash = excluded.password_hash, enabled = 1, setup_completed = 0, \
         initial_password = excluded.initial_password, updated_at = excluded.updated_at",
    )
    .bind(DEFAULT_USERNAME)
    .bind(hash_password(&initial))
    .bind(&initial)
    .bind(Ts::now())
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM auth_sessions")
        .execute(&mut *tx)
        .await?;
    let record = get_local_auth(&mut tx).await?.expect("just written");
    tx.commit().await?;
    Ok(record)
}

pub fn check_credentials(record: Option<&LocalAuthRow>, username: &str, password: &str) -> bool {
    let matches = record.is_some_and(|r| {
        super::secrets::constant_eq(
            username.trim().to_lowercase().as_bytes(),
            r.username.to_lowercase().as_bytes(),
        )
    });
    match record {
        Some(r) if matches => verify_password(password, &r.password_hash),
        _ => {
            verify_password(password, &DUMMY_HASH);
            false
        }
    }
}

pub async fn create_session(conn: &mut Conn) -> Result<String, sqlx::Error> {
    let token = token_urlsafe(32);
    let now = Ts::now();
    sqlx::query("INSERT INTO auth_sessions (token_hash, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(sha256_hex(&token))
        .bind(now)
        .bind(now)
        .bind(now.plus(Duration::days(30)))
        .execute(conn)
        .await?;
    Ok(token)
}

pub async fn find_session(conn: &mut Conn, token: &str) -> Result<bool, sqlx::Error> {
    let hash = sha256_hex(token);
    let record: Option<(i64, Ts, Ts)> = sqlx::query_as(
        "SELECT id, last_used_at, expires_at FROM auth_sessions WHERE token_hash = ?",
    )
    .bind(&hash)
    .fetch_optional(&mut *conn)
    .await?;
    let Some((id, last_used_at, expires_at)) = record else {
        return Ok(false);
    };
    let now = Ts::now();
    if expires_at <= now {
        sqlx::query("DELETE FROM auth_sessions WHERE id = ?")
            .bind(id)
            .execute(&mut *conn)
            .await?;
        return Ok(false);
    }
    if now.since(last_used_at) > Duration::hours(1) {
        sqlx::query("UPDATE auth_sessions SET last_used_at = ?, expires_at = ? WHERE id = ?")
            .bind(now)
            .bind(now.plus(Duration::days(30)))
            .bind(id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(true)
}

async fn revoke_session(conn: &mut Conn, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM auth_sessions WHERE token_hash = ?")
        .bind(sha256_hex(token))
        .execute(conn)
        .await?;
    Ok(())
}

fn login_blocked(state: &AppState, key: &str) -> bool {
    let mut failures = state.login_failures.lock().unwrap();
    let recent: Vec<Instant> = failures
        .get(key)
        .map(|times| {
            times
                .iter()
                .copied()
                .filter(|t| t.elapsed() < FAILED_LOGIN_WINDOW)
                .collect()
        })
        .unwrap_or_default();
    let blocked = recent.len() >= MAX_FAILED_LOGINS;
    failures.insert(key.to_string(), recent);
    blocked
}

fn record_failed_login(state: &AppState, key: &str) {
    state
        .login_failures
        .lock()
        .unwrap()
        .entry(key.to_string())
        .or_default()
        .push(Instant::now());
}

fn clear_failed_logins(state: &AppState, key: &str) {
    state.login_failures.lock().unwrap().remove(key);
}

pub struct Meta(pub RequestMeta);

impl axum::extract::FromRequestParts<AppState> for Meta {
    type Rejection = ApiError;
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(Meta(RequestMeta::from_parts(
            parts,
            &state.config.trusted_proxies,
        )))
    }
}

#[derive(Serialize)]
struct AuthStatus {
    mode: AuthMode,
    configured_mode: AuthMode,
    authenticated: bool,
    setup_required: bool,
    username: Option<String>,
    firebase: Option<FirebaseWebConfig>,
    logout_url: Option<String>,
}

async fn auth_status(
    State(state): State<AppState>,
    Meta(meta): Meta,
    headers: HeaderMap,
) -> ApiResult<Json<AuthStatus>> {
    let mut conn = state.db.acquire().await?;
    let mode = super::effective_mode(&state, &mut conn).await?;
    let mut status = AuthStatus {
        mode,
        configured_mode: state.config.auth_mode,
        authenticated: false,
        setup_required: false,
        username: None,
        firebase: None,
        logout_url: None,
    };
    match mode {
        AuthMode::None => status.authenticated = true,
        AuthMode::Local => {
            let record = get_local_auth(&mut conn).await?;
            let identity = super::local_identity(&state, &mut conn, &headers).await?;
            status.authenticated = identity.is_some();
            status.setup_required = record.is_some_and(|r| !r.setup_completed);
            status.username = identity.and_then(|i| i.username);
        }
        AuthMode::Desktop => {
            status.authenticated = super::desktop_identity(&state, &headers).is_some()
        }
        AuthMode::Firebase => status.firebase = state.config.firebase_web.clone(),
        AuthMode::Proxy | AuthMode::CloudflareAccess => {
            status.logout_url = super::external_logout_url(&state);
            let identity = super::external_identity(&state, &headers, &meta)
                .await
                .ok()
                .flatten();
            status.authenticated = identity.is_some();
            status.username = identity.and_then(|i| i.username);
        }
    }
    Ok(Json(status))
}

#[derive(Deserialize)]
struct DesktopQuery {
    secret: String,
}

async fn desktop_sign_in(
    State(state): State<AppState>,
    Q(query): Q<DesktopQuery>,
) -> ApiResult<Response> {
    if state.config.auth_mode != AuthMode::Desktop
        || !super::desktop_secret_matches(&state, Some(&query.secret))
    {
        return Err(ApiError::not_found("Not found"));
    }
    Ok((
        StatusCode::SEE_OTHER,
        [
            (LOCATION, "/".to_string()),
            (
                SET_COOKIE,
                set_cookie(DESKTOP_COOKIE, &query.secret, None, "strict", false),
            ),
        ],
    )
        .into_response())
}

fn require_local_mode(state: &AppState) -> ApiResult<()> {
    if state.config.auth_mode != AuthMode::Local {
        return Err(ApiError::conflict(
            "Username and password sign-in isn't enabled on this server",
        ));
    }
    Ok(())
}

fn session_cookie(meta: &RequestMeta, token: &str) -> String {
    set_cookie(
        SESSION_COOKIE,
        token,
        Some(COOKIE_MAX_AGE),
        "lax",
        meta.scheme == "https",
    )
}

#[derive(Deserialize)]
struct LoginBody {
    username: String,
    password: String,
    #[serde(default)]
    device_name: Option<String>,
}

async fn verify_login(
    state: &AppState,
    conn: &mut Conn,
    body: &LoginBody,
    meta: &RequestMeta,
) -> ApiResult<()> {
    check_len("username", &body.username, 100)?;
    check_len("password", &body.password, 500)?;
    require_local_mode(state)?;
    let key = meta.client.clone().unwrap_or_else(|| "unknown".into());
    if login_blocked(state, &key) {
        return Err(ApiError::new(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many failed attempts. Try again in a few minutes.",
        ));
    }
    let record = get_local_auth(conn).await?;
    let (username, password) = (body.username.clone(), body.password.clone());
    let ok = tokio::task::spawn_blocking(move || {
        check_credentials(record.as_ref(), &username, &password)
    })
    .await
    .unwrap_or(false);
    if !ok {
        record_failed_login(state, &key);
        return Err(ApiError::unauthorized("Wrong username or password"));
    }
    clear_failed_logins(state, &key);
    Ok(())
}

async fn login(
    State(state): State<AppState>,
    Meta(meta): Meta,
    Body(body): Body<LoginBody>,
) -> ApiResult<Response> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    verify_login(&state, &mut tx, &body, &meta).await?;
    let token = create_session(&mut tx).await?;
    tx.commit().await?;
    Ok((
        StatusCode::NO_CONTENT,
        [(SET_COOKIE, session_cookie(&meta, &token))],
    )
        .into_response())
}

async fn login_for_token(
    State(state): State<AppState>,
    Meta(meta): Meta,
    Body(body): Body<LoginBody>,
) -> ApiResult<Json<tokens::CreatedToken>> {
    let device = body
        .device_name
        .clone()
        .unwrap_or_else(|| "Mobile app".into());
    check_len("device_name", &device, 80)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    verify_login(&state, &mut tx, &body, &meta).await?;
    let name = if device.trim().is_empty() {
        "Mobile app"
    } else {
        device.trim()
    };
    let created = tokens::issue(&mut tx, name, tokens::APP_SCOPE, None, None).await?;
    tx.commit().await?;
    Ok(Json(created))
}

async fn revoke_own_token(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<StatusCode> {
    let token = super::bearer_token(&headers).filter(|t| t.starts_with(tokens::TOKEN_PREFIX));
    let Some(token) = token else {
        return Err(ApiError::unauthorized("Not authenticated"));
    };
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let Some(record) = tokens::find_active(&mut tx, &token).await? else {
        return Err(ApiError::unauthorized("Not authenticated"));
    };
    tokens::revoke(&mut tx, record.id).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Response> {
    if let Some(token) = cookie(&headers, SESSION_COOKIE) {
        let mut conn = state.db.acquire().await?;
        revoke_session(&mut conn, &token).await?;
    }
    Ok((
        StatusCode::NO_CONTENT,
        [(SET_COOKIE, delete_cookie(SESSION_COOKIE))],
    )
        .into_response())
}

#[derive(Deserialize)]
struct LocalAuthBody {
    enabled: bool,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    current_password: Option<String>,
}

async fn update_local_auth(
    State(state): State<AppState>,
    Meta(meta): Meta,
    headers: HeaderMap,
    Body(body): Body<LocalAuthBody>,
) -> ApiResult<Response> {
    check_opt_len("username", body.username.as_deref(), 100)?;
    check_opt_len("password", body.password.as_deref(), 500)?;
    check_opt_len("current_password", body.current_password.as_deref(), 500)?;
    require_local_mode(&state)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let Some(record) = get_local_auth(&mut tx).await? else {
        return Err(ApiError::conflict("Sign-in isn't initialised yet"));
    };
    if record.enabled {
        if super::local_identity(&state, &mut tx, &headers)
            .await?
            .is_none()
        {
            return Err(ApiError::unauthorized("Not authenticated"));
        }
        if record.setup_completed {
            let current = body.current_password.clone().unwrap_or_default();
            let check = record.clone();
            let ok = tokio::task::spawn_blocking(move || {
                check_credentials(Some(&check), &check.username, &current)
            })
            .await
            .unwrap_or(false);
            if !ok {
                return Err(ApiError::forbidden("Current password is wrong"));
            }
        }
    }
    let mut username = record.username.clone();
    let mut password_hash = record.password_hash.clone();
    if body.enabled {
        username = body.username.clone().unwrap_or_default().trim().to_string();
        let password = body.password.clone().unwrap_or_default();
        if username.is_empty() {
            return Err(ApiError::bad_request("Username cannot be empty"));
        }
        if password.chars().count() < MIN_PASSWORD_LENGTH {
            return Err(ApiError::bad_request(format!(
                "Password must be at least {MIN_PASSWORD_LENGTH} characters"
            )));
        }
        password_hash = tokio::task::spawn_blocking(move || hash_password(&password))
            .await
            .map_err(|_| ApiError::internal("Internal Server Error"))?;
    }
    sqlx::query(
        "UPDATE local_auth SET username = ?, password_hash = ?, enabled = ?, setup_completed = 1, \
         initial_password = NULL, updated_at = ? WHERE id = 1",
    )
    .bind(&username)
    .bind(&password_hash)
    .bind(body.enabled)
    .bind(Ts::now())
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM auth_sessions")
        .execute(&mut *tx)
        .await?;
    let cookie_header = if body.enabled {
        session_cookie(&meta, &create_session(&mut tx).await?)
    } else {
        delete_cookie(SESSION_COOKIE)
    };
    tx.commit().await?;
    Ok((StatusCode::NO_CONTENT, [(SET_COOKIE, cookie_header)]).into_response())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/status", get(auth_status))
        .route("/api/auth/desktop", get(desktop_sign_in))
        .route("/api/auth/login", post(login))
        .route(
            "/api/auth/token",
            post(login_for_token).delete(revoke_own_token),
        )
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/local", put(update_local_auth))
}
