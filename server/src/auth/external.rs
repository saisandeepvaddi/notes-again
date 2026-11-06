use std::collections::HashMap;
use std::time::{Duration, Instant};

use axum::http::HeaderMap;
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde_json::Value;
use tokio::sync::Mutex;

use super::Identity;
use super::request::{RequestMeta, cookie, header, is_trusted};
use crate::error::ApiError;
use crate::state::AppState;

pub const CLOUDFLARE_LOGOUT_URL: &str = "/cdn-cgi/access/logout";
pub const FIREBASE_JWKS: &str =
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const JWKS_LIFETIME: Duration = Duration::from_secs(3600);

#[derive(Default)]
pub struct JwksCache {
    sets: Mutex<HashMap<String, (Instant, JwkSet)>>,
}

impl JwksCache {
    pub async fn insert(&self, url: &str, set: JwkSet) {
        self.sets
            .lock()
            .await
            .insert(url.to_string(), (Instant::now(), set));
    }

    async fn get(
        &self,
        http: &reqwest::Client,
        url: &str,
        refresh: bool,
    ) -> Result<JwkSet, String> {
        let mut sets = self.sets.lock().await;
        if !refresh
            && let Some((fetched, set)) = sets.get(url)
            && fetched.elapsed() < JWKS_LIFETIME
        {
            return Ok(set.clone());
        }
        let set: JwkSet = http
            .get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        sets.insert(url.to_string(), (Instant::now(), set.clone()));
        Ok(set)
    }
}

async fn verify_rs256(
    state: &AppState,
    url: &str,
    token: &str,
    audience: &str,
    issuer: &str,
) -> Result<Value, String> {
    let header = decode_header(token).map_err(|e| e.to_string())?;
    let kid = header.kid.ok_or("token has no key id")?;
    let mut set = state.jwks.get(&state.http, url, false).await?;
    if set.find(&kid).is_none() {
        set = state.jwks.get(&state.http, url, true).await?;
    }
    let jwk = set.find(&kid).ok_or("unknown signing key")?;
    let key = DecodingKey::from_jwk(jwk).map_err(|e| e.to_string())?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[audience]);
    validation.set_issuer(&[issuer]);
    validation.leeway = 60;
    let data = decode::<Value>(token, &key, &validation).map_err(|e| e.to_string())?;
    Ok(data.claims)
}

pub fn proxy_user(state: &AppState, headers: &HeaderMap, meta: &RequestMeta) -> Option<String> {
    if !is_trusted(meta.peer.as_deref(), &state.config.trusted_proxies) {
        return None;
    }
    let value = header(headers, &state.config.proxy_header)
        .unwrap_or("")
        .trim();
    (!value.is_empty()).then(|| value.to_string())
}

pub async fn cloudflare_email(state: &AppState, headers: &HeaderMap) -> Option<String> {
    let token = header(headers, "cf-access-jwt-assertion")
        .map(str::to_string)
        .filter(|t| !t.is_empty())
        .or_else(|| cookie(headers, "CF_Authorization"))?;
    let team = &state.config.cloudflare_team_domain;
    let url = format!("https://{team}/cdn-cgi/access/certs");
    match verify_rs256(
        state,
        &url,
        &token,
        &state.config.cloudflare_audience,
        &format!("https://{team}"),
    )
    .await
    {
        Ok(claims) => ["email", "common_name"].iter().find_map(|key| {
            claims
                .get(*key)
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        }),
        Err(error) => {
            tracing::warn!("Rejected Cloudflare Access token: {error}");
            None
        }
    }
}

pub async fn firebase_identity(state: &AppState, token: &str) -> Result<Identity, ApiError> {
    let project = state.config.firebase_project_id.clone().unwrap_or_default();
    let issuer = format!("https://securetoken.google.com/{project}");
    let claims = match verify_rs256(state, FIREBASE_JWKS, token, &project, &issuer).await {
        Ok(claims)
            if claims
                .get("sub")
                .and_then(Value::as_str)
                .is_some_and(|s| !s.is_empty()) =>
        {
            claims
        }
        Ok(_) => return Err(ApiError::unauthorized("Invalid authentication")),
        Err(error) => {
            tracing::warn!("Rejected Firebase token: {error}");
            return Err(ApiError::unauthorized("Invalid authentication"));
        }
    };
    let email = claims
        .get("email")
        .and_then(Value::as_str)
        .map(str::to_string);
    if !state.config.is_allowed(email.as_deref()) {
        tracing::warn!("Rejected sign-in from an email not in ALLOWED_EMAILS: {email:?}");
        return Err(ApiError::forbidden("This account is not allowed"));
    }
    let uid = claims
        .get("user_id")
        .or_else(|| claims.get("sub"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    Ok(Identity {
        email,
        uid,
        username: None,
        auth: super::AuthKind::Session,
        scope: None,
    })
}
