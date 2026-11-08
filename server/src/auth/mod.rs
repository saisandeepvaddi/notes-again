pub mod external;
pub mod local;
pub mod request;
pub mod secrets;
pub mod tokens;

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::config::AuthMode;
use crate::db::Conn;
use crate::error::ApiError;
use crate::state::AppState;
use request::{RequestMeta, cookie, header};

pub const DESKTOP_COOKIE: &str = "notes_again_desktop";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthKind {
    None,
    Session,
    ApiToken,
}

#[derive(Clone, Debug)]
pub struct Identity {
    pub email: Option<String>,
    pub uid: String,
    pub username: Option<String>,
    pub auth: AuthKind,
    pub scope: Option<String>,
}

impl Identity {
    fn session(email: Option<String>, uid: String, username: Option<String>) -> Identity {
        Identity {
            email,
            uid,
            username,
            auth: AuthKind::Session,
            scope: None,
        }
    }

    pub fn require_session(&self) -> Result<(), ApiError> {
        if self.auth == AuthKind::ApiToken {
            return Err(ApiError::forbidden("API tokens can't manage tokens"));
        }
        Ok(())
    }
}

pub async fn effective_mode(state: &AppState, conn: &mut Conn) -> Result<AuthMode, sqlx::Error> {
    if state.config.auth_mode == AuthMode::Local {
        let enabled: Option<bool> =
            sqlx::query_scalar("SELECT enabled FROM local_auth WHERE id = 1")
                .fetch_optional(&mut *conn)
                .await?;
        if enabled == Some(false) {
            return Ok(AuthMode::None);
        }
    }
    Ok(state.config.auth_mode)
}

pub fn bearer_token(headers: &axum::http::HeaderMap) -> Option<String> {
    let value = header(headers, "authorization")?;
    let token = value.strip_prefix("Bearer ")?.trim();
    (!token.is_empty()).then(|| token.to_string())
}

pub fn desktop_secret_matches(state: &AppState, candidate: Option<&str>) -> bool {
    match (state.config.desktop_secret.as_deref(), candidate) {
        (Some(secret), Some(candidate)) if !secret.is_empty() && !candidate.is_empty() => {
            secrets::constant_eq(candidate.as_bytes(), secret.as_bytes())
        }
        _ => false,
    }
}

pub fn desktop_identity(state: &AppState, headers: &axum::http::HeaderMap) -> Option<Identity> {
    let by_cookie = desktop_secret_matches(state, cookie(headers, DESKTOP_COOKIE).as_deref());
    let by_bearer = desktop_secret_matches(state, bearer_token(headers).as_deref());
    (by_cookie || by_bearer).then(|| Identity::session(None, "desktop".into(), None))
}

pub async fn local_identity(
    state: &AppState,
    conn: &mut Conn,
    headers: &axum::http::HeaderMap,
) -> Result<Option<Identity>, sqlx::Error> {
    let Some(token) = cookie(headers, local::SESSION_COOKIE) else {
        return Ok(None);
    };
    let _ = state;
    let Some(record) = local::get_local_auth(conn).await? else {
        return Ok(None);
    };
    if !local::find_session(conn, &token).await? {
        return Ok(None);
    }
    Ok(Some(Identity::session(
        None,
        format!("local:{}", record.username),
        Some(record.username),
    )))
}

pub async fn external_identity(
    state: &AppState,
    headers: &axum::http::HeaderMap,
    meta: &RequestMeta,
) -> Result<Option<Identity>, ApiError> {
    let (user, kind) = match state.config.auth_mode {
        AuthMode::Proxy => (external::proxy_user(state, headers, meta), "proxy"),
        AuthMode::CloudflareAccess => (
            external::cloudflare_email(state, headers).await,
            "cloudflare",
        ),
        _ => return Ok(None),
    };
    let Some(user) = user else { return Ok(None) };
    if !state.config.is_allowed(Some(&user)) {
        tracing::warn!("Rejected sign-in from a user not in ALLOWED_EMAILS: {user}");
        return Err(ApiError::forbidden("This account is not allowed"));
    }
    Ok(Some(Identity::session(
        Some(user.clone()),
        format!("{kind}:{user}"),
        Some(user),
    )))
}

pub fn external_logout_url(state: &AppState) -> Option<String> {
    match state.config.auth_mode {
        AuthMode::Proxy => state.config.proxy_logout_url.clone(),
        AuthMode::CloudflareAccess => Some(external::CLOUDFLARE_LOGOUT_URL.to_string()),
        _ => None,
    }
}

async fn identity_from_api_token(
    state: &AppState,
    conn: &mut Conn,
    method: &str,
    path: &str,
    token: &str,
) -> Result<Identity, ApiError> {
    let record = tokens::find_active(conn, token).await?;
    let Some(record) = record.filter(|r| state.config.is_allowed(r.created_by.as_deref())) else {
        return Err(ApiError::unauthorized("Invalid authentication"));
    };
    if !tokens::scope_allows(&record.scope, method, path) {
        return Err(ApiError::forbidden("This token isn't allowed to do that"));
    }
    tokens::record_use(conn, &record).await?;
    Ok(Identity {
        email: record.created_by.clone(),
        uid: format!("token:{}", record.id),
        username: None,
        auth: AuthKind::ApiToken,
        scope: Some(record.scope),
    })
}

async fn identify(
    state: &AppState,
    parts: &axum::http::request::Parts,
) -> Result<Identity, ApiError> {
    let mut conn = state.db.acquire().await?;
    let mode = effective_mode(state, &mut conn).await?;
    if mode == AuthMode::None {
        return Ok(Identity {
            email: Some("dev@localhost".into()),
            uid: "dev".into(),
            username: None,
            auth: AuthKind::None,
            scope: None,
        });
    }
    let token = bearer_token(&parts.headers);
    if let Some(token) = token
        .as_deref()
        .filter(|t| t.starts_with(tokens::TOKEN_PREFIX))
    {
        let path = parts
            .extensions
            .get::<axum::extract::OriginalUri>()
            .map(|uri| uri.0.path().to_string())
            .unwrap_or_else(|| parts.uri.path().to_string());
        return identity_from_api_token(state, &mut conn, parts.method.as_str(), &path, token)
            .await;
    }
    let identity = match mode {
        AuthMode::Local => local_identity(state, &mut conn, &parts.headers).await?,
        AuthMode::Desktop => desktop_identity(state, &parts.headers),
        AuthMode::Proxy | AuthMode::CloudflareAccess => {
            let meta = RequestMeta::from_parts(parts, &state.config.trusted_proxies);
            external_identity(state, &parts.headers, &meta).await?
        }
        AuthMode::Firebase => {
            let Some(token) = token else {
                return Err(ApiError::unauthorized("Not authenticated"));
            };
            return external::firebase_identity(state, &token).await;
        }
        AuthMode::None => unreachable!(),
    };
    identity.ok_or_else(|| ApiError::unauthorized("Not authenticated"))
}

pub async fn require_user(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let (mut parts, body) = request.into_parts();
    match identify(&state, &parts).await {
        Ok(identity) => {
            parts.extensions.insert(identity);
            next.run(Request::from_parts(parts, body)).await
        }
        Err(error) => error.into_response(),
    }
}
