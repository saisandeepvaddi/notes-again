use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::http::header::{AUTHORIZATION, COOKIE};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::Identity;
use crate::auth::tokens::{self, APP_SCOPE, TOKEN_PREFIX};
use crate::config::AuthMode;
use crate::db::BEGIN_WRITE;
use crate::error::{ApiError, ApiResult, Body};
use crate::state::AppState;
use crate::time::Ts;

pub const DESKTOP_PORT: u16 = 47821;
pub const LAN_PORT: u16 = 47822;
const LAN_SETTING: &str = "lan_access";
const PAIRED_BY: &str = "desktop-pairing";
const CERT_SETTING: &str = "lan_cert";
const KEY_SETTING: &str = "lan_key";

pub struct LanListener {
    pub port: u16,
    pub fingerprint: String,
    handle: axum_server::Handle<SocketAddr>,
    task: tokio::task::JoinHandle<()>,
}

async fn identity(state: &AppState) -> Result<crate::tls::Identity, String> {
    let stored = (
        crate::db::device_setting(&state.db, CERT_SETTING)
            .await
            .map_err(|e| e.to_string())?,
        crate::db::device_setting(&state.db, KEY_SETTING)
            .await
            .map_err(|e| e.to_string())?,
    );
    if let (Some(cert), Some(key)) = stored
        && let (Ok(cert), Ok(key)) = (BASE64.decode(cert), BASE64.decode(key))
    {
        return Ok(crate::tls::Identity { cert, key });
    }
    let fresh = crate::tls::generate_identity()?;
    crate::db::set_device_setting(&state.db, CERT_SETTING, Some(&BASE64.encode(&fresh.cert)))
        .await
        .map_err(|e| e.to_string())?;
    crate::db::set_device_setting(&state.db, KEY_SETTING, Some(&BASE64.encode(&fresh.key)))
        .await
        .map_err(|e| e.to_string())?;
    Ok(fresh)
}

pub async fn bind(preferred: u16, host: &str) -> std::io::Result<tokio::net::TcpListener> {
    match tokio::net::TcpListener::bind((host, preferred)).await {
        Ok(listener) => Ok(listener),
        Err(_) => tokio::net::TcpListener::bind((host, 0)).await,
    }
}

fn reject(status: StatusCode, detail: &str) -> Response {
    (status, Json(json!({ "detail": detail }))).into_response()
}

async fn lan_guard(mut request: Request, next: Next) -> Response {
    request.headers_mut().remove(COOKIE);
    let path = request.uri().path();
    if path == "/healthz" || path == "/api/auth/status" {
        return next.run(request).await;
    }
    if !path.starts_with("/api/") {
        return reject(StatusCode::NOT_FOUND, "Not found");
    }
    let has_token = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .is_some_and(|t| t.trim().starts_with(TOKEN_PREFIX));
    if !has_token {
        return reject(
            StatusCode::UNAUTHORIZED,
            "Pair this device with the QR code in the desktop app's Settings.",
        );
    }
    next.run(request).await
}

pub fn router_for_network(state: AppState) -> Router {
    crate::app::router(state).layer(axum::middleware::from_fn(lan_guard))
}

pub async fn start(state: &AppState) -> std::io::Result<u16> {
    let mut lan = state.lan.lock().await;
    if let Some(listener) = lan.as_ref() {
        return Ok(listener.port);
    }
    let identity = identity(state).await.map_err(std::io::Error::other)?;
    let config = crate::tls::server_config(&identity).map_err(std::io::Error::other)?;
    let listener = std::net::TcpListener::bind(("0.0.0.0", LAN_PORT))
        .or_else(|_| std::net::TcpListener::bind(("0.0.0.0", 0)))?;
    listener.set_nonblocking(true)?;
    let port = listener.local_addr()?.port();
    let handle = axum_server::Handle::new();
    let server = axum_server::tls_rustls::from_tcp_rustls(
        listener,
        axum_server::tls_rustls::RustlsConfig::from_config(Arc::new(config)),
    )?
    .handle(handle.clone());
    let app = router_for_network(state.clone());
    let task = tokio::spawn(async move {
        let served = server
            .serve(app.into_make_service_with_connect_info::<SocketAddr>())
            .await;
        if let Err(error) = served {
            tracing::error!("The local network listener stopped: {error}");
        }
    });
    tracing::info!("Phones on this network can connect on port {port}");
    *lan = Some(LanListener {
        port,
        fingerprint: crate::tls::fingerprint(&identity.cert),
        handle,
        task,
    });
    Ok(port)
}

pub async fn stop(state: &AppState) {
    let listener = state.lan.lock().await.take();
    if let Some(listener) = listener {
        listener
            .handle
            .graceful_shutdown(Some(Duration::from_secs(1)));
        let _ = listener.task.await;
    }
}

pub async fn restore(state: &AppState) {
    if state.config.auth_mode != AuthMode::Desktop {
        return;
    }
    match crate::db::device_setting(&state.db, LAN_SETTING).await {
        Ok(Some(value)) if value == "on" => {
            if let Err(error) = start(state).await {
                tracing::error!("Couldn't open the local network listener: {error}");
            }
        }
        Ok(_) => {}
        Err(error) => tracing::warn!("Couldn't read the phone access setting: {error}"),
    }
}

fn lan_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

fn mdns_host() -> Option<String> {
    let host = gethostname::gethostname().to_string_lossy().to_string();
    let host = host.trim().trim_end_matches(".local").replace(' ', "-");
    (!host.is_empty()).then(|| format!("{host}.local"))
}

fn network_urls(port: u16) -> Vec<String> {
    lan_ip()
        .map(|ip| format!("https://{ip}:{port}"))
        .into_iter()
        .chain(mdns_host().map(|host| format!("https://{host}:{port}")))
        .collect()
}

#[derive(Serialize)]
struct NetworkAccess {
    enabled: bool,
    port: Option<u16>,
    fingerprint: Option<String>,
    urls: Vec<String>,
    paired_devices: i64,
}

#[derive(Serialize)]
struct Connections {
    local_url: Option<String>,
    network: NetworkAccess,
}

fn guard(state: &AppState, identity: &Identity) -> Result<(), ApiError> {
    if state.config.auth_mode != AuthMode::Desktop {
        return Err(ApiError::not_found("Not found"));
    }
    identity.require_session()
}

async fn connections_info(state: &AppState) -> ApiResult<Connections> {
    let (port, fingerprint) = match state.lan.lock().await.as_ref() {
        Some(listener) => (Some(listener.port), Some(listener.fingerprint.clone())),
        None => (None, None),
    };
    let paired_devices: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM api_tokens WHERE created_by = ? AND revoked_at IS NULL",
    )
    .bind(PAIRED_BY)
    .fetch_one(&state.db)
    .await?;
    Ok(Connections {
        local_url: state
            .desktop_port
            .get()
            .map(|port| format!("http://127.0.0.1:{port}")),
        network: NetworkAccess {
            enabled: port.is_some(),
            port,
            fingerprint,
            urls: port.map(network_urls).unwrap_or_default(),
            paired_devices,
        },
    })
}

async fn connections(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
) -> ApiResult<Json<Connections>> {
    guard(&state, &identity)?;
    Ok(Json(connections_info(&state).await?))
}

#[derive(Deserialize)]
struct NetworkUpdate {
    enabled: bool,
}

async fn update_network(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
    Body(body): Body<NetworkUpdate>,
) -> ApiResult<Json<Connections>> {
    guard(&state, &identity)?;
    if body.enabled {
        start(&state)
            .await
            .map_err(|e| ApiError::internal(format!("Couldn't open a port for phones: {e}")))?;
        crate::db::set_device_setting(&state.db, LAN_SETTING, Some("on")).await?;
    } else {
        stop(&state).await;
        crate::db::set_device_setting(&state.db, LAN_SETTING, None).await?;
        let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
        sqlx::query(
            "UPDATE api_tokens SET revoked_at = ? WHERE created_by = ? AND revoked_at IS NULL",
        )
        .bind(Ts::now())
        .bind(PAIRED_BY)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
    }
    Ok(Json(connections_info(&state).await?))
}

#[derive(Serialize)]
struct Pairing {
    token: String,
    server: String,
    alt: Option<String>,
    fingerprint: String,
}

async fn pair(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
) -> ApiResult<Json<Pairing>> {
    guard(&state, &identity)?;
    let Some((port, fingerprint)) = state
        .lan
        .lock()
        .await
        .as_ref()
        .map(|l| (l.port, l.fingerprint.clone()))
    else {
        return Err(ApiError::conflict("Turn on phone access first."));
    };
    let mut urls = network_urls(port).into_iter();
    let Some(server) = urls.next() else {
        return Err(ApiError::conflict(
            "This computer isn't on a network the phone can reach.",
        ));
    };
    let name = format!("Phone (paired {})", Ts::now().0.format("%Y-%m-%d %H:%M"));
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let created = tokens::issue(&mut tx, &name, APP_SCOPE, Some(PAIRED_BY), None).await?;
    tx.commit().await?;
    Ok(Json(Pairing {
        token: created.token,
        server,
        alt: urls.next(),
        fingerprint,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/desktop/connections", get(connections))
        .route("/desktop/network", put(update_network))
        .route("/desktop/network/pair", post(pair))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_urls_use_the_port() {
        for url in network_urls(47822) {
            assert!(
                url.starts_with("https://") && url.ends_with(":47822"),
                "{url}"
            );
        }
    }
}
