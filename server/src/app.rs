use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};

use axum::body::Body as AxumBody;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;
use tower::ServiceExt;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use tower_http::services::ServeFile;

use crate::state::AppState;

const MAX_BODY_BYTES: usize = 256 * 1024 * 1024;
const SYNC_ONLY_PAGE: &str = "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\">\
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
<title>Notes Again server</title>\
<body style=\"font-family: system-ui, sans-serif; max-width: 34rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5\">\
<h1>Notes Again server</h1>\
<p>This server syncs your notes between devices. Its web app is turned off (<code>WEB_UI=off</code>).</p>\
<p>Connect the desktop app (Settings &rarr; Sync) or the mobile app to this address.</p>\
</body></html>";

fn api_router(state: &AppState) -> Router<AppState> {
    Router::new()
        .merge(crate::notes::bulk_routes::router())
        .merge(crate::notes::revisions::router())
        .merge(crate::attachments::router())
        .merge(crate::links::router())
        .merge(crate::notes::routes::router())
        .merge(crate::groups::router())
        .merge(crate::imports::router())
        .merge(crate::auth::tokens::router())
        .merge(crate::system::router())
        .merge(crate::search::router())
        .merge(crate::discussion::router())
        .merge(crate::sync::server::router())
        .merge(crate::sync::blobs::router())
        .merge(crate::sync::local::router(state.clone()))
        .merge(crate::lan::router())
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::auth::require_user,
        ))
}

fn cors(state: &AppState) -> Option<CorsLayer> {
    let origins = state.config.cors_origins.clone();
    let pattern = state
        .config
        .cors_origin_regex
        .as_deref()
        .and_then(|p| regex::Regex::new(&format!("^(?:{p})$")).ok());
    if origins.is_empty() && pattern.is_none() {
        return None;
    }
    let allow = AllowOrigin::predicate(move |origin: &HeaderValue, _| {
        let Ok(origin) = origin.to_str() else {
            return false;
        };
        origins.iter().any(|o| o == origin) || pattern.as_ref().is_some_and(|p| p.is_match(origin))
    });
    Some(
        CorsLayer::new()
            .allow_origin(allow)
            .allow_credentials(true)
            .allow_methods(AllowMethods::mirror_request())
            .allow_headers(AllowHeaders::mirror_request())
            .expose_headers([axum::http::header::CONTENT_DISPOSITION]),
    )
}

fn safe_join(root: &Path, path: &str) -> Option<PathBuf> {
    let mut out = root.to_path_buf();
    for component in Path::new(path).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

async fn serve_file(path: PathBuf, request: Request, cache: &'static str) -> Response {
    match ServeFile::new(path).oneshot(request).await {
        Ok(response) => {
            let mut response = response.map(AxumBody::new);
            response
                .headers_mut()
                .insert(CACHE_CONTROL, HeaderValue::from_static(cache));
            response
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn spa(State(state): State<AppState>, request: Request) -> Response {
    let path = request.uri().path().trim_start_matches('/').to_string();
    if path.starts_with("api/") || path == "api" {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "message": "Not found" })),
        )
            .into_response();
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    if !state.config.web_ui {
        if path.is_empty() {
            return (
                [(CACHE_CONTROL, HeaderValue::from_static("no-cache"))],
                axum::response::Html(SYNC_ONLY_PAGE),
            )
                .into_response();
        }
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "message": "Not found" })),
        )
            .into_response();
    }
    let root = &state.config.frontend_dist;
    if !path.is_empty()
        && let Some(candidate) = safe_join(root, &path).filter(|p| p.is_file())
    {
        let cache = if path.starts_with("assets/") {
            "public, max-age=31536000, immutable"
        } else {
            "no-cache"
        };
        return serve_file(candidate, request, cache).await;
    }
    let index = root.join("index.html");
    if index.is_file() {
        let mut response = serve_file(index, request, "no-cache").await;
        response.headers_mut().insert(
            CONTENT_TYPE,
            HeaderValue::from_static("text/html; charset=utf-8"),
        );
        return response;
    }
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "message": "Frontend not built" })),
    )
        .into_response()
}

async fn healthz() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

pub fn router(state: AppState) -> Router {
    let mut app = Router::new()
        .merge(crate::auth::local::router())
        .nest("/api", api_router(&state))
        .route("/healthz", get(healthz))
        .fallback(spa)
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES));
    if let Some(cors) = cors(&state) {
        app = app.layer(cors);
    }
    app.with_state(state)
}

pub async fn serve(
    listener: tokio::net::TcpListener,
    state: AppState,
    shutdown: impl std::future::Future<Output = ()> + Send + 'static,
) -> std::io::Result<()> {
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown)
    .await
}
