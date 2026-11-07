use std::path::{Path, PathBuf};

use axum::body::Body as AxumBody;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::{Identity, effective_mode};
use crate::backups::{
    Snapshot, check_backup_dir, copy_database, create_snapshot, find_snapshot, list_snapshots,
    request_restore, save_backup_dir,
};
use crate::config::AuthMode;
use crate::error::{ApiError, ApiResult, Body, P};
use crate::state::AppState;
use crate::time::Ts;

#[derive(Serialize)]
struct SnapshotInfo {
    name: String,
    created_at: Ts,
    size_bytes: u64,
}

impl From<&Snapshot> for SnapshotInfo {
    fn from(snapshot: &Snapshot) -> Self {
        SnapshotInfo {
            name: snapshot
                .path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string(),
            created_at: snapshot.created_at,
            size_bytes: snapshot.size_bytes,
        }
    }
}

#[derive(Serialize)]
struct BackupsInfo {
    directory: String,
    default_directory: String,
    custom_directory: bool,
    can_change_directory: bool,
    can_restore: bool,
    interval_hours: u64,
    keep: usize,
    count: usize,
    latest: Option<SnapshotInfo>,
    offsite_url: Option<String>,
}

#[derive(Serialize)]
struct SystemInfo {
    database_path: String,
    database_size_bytes: u64,
    sqlite_version: String,
    note_count: i64,
    in_container: bool,
    auth_mode: AuthMode,
    backups: BackupsInfo,
}

fn database_size(path: &Path) -> u64 {
    [
        path.to_path_buf(),
        Path::new(&format!("{}-wal", path.display())).to_path_buf(),
    ]
    .iter()
    .filter_map(|p| std::fs::metadata(p).ok())
    .filter(|m| m.is_file())
    .map(|m| m.len())
    .sum()
}

fn is_desktop(state: &AppState) -> bool {
    state.config.auth_mode == AuthMode::Desktop
}

async fn system_info(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
) -> ApiResult<Json<SystemInfo>> {
    identity.require_session()?;
    let mut conn = state.db.acquire().await?;
    let note_count: i64 = sqlx::query_scalar("SELECT count(*) FROM notes WHERE deleted_at IS NULL")
        .fetch_one(&mut *conn)
        .await?;
    let auth_mode = effective_mode(&state, &mut conn).await?;
    let directory = state.backup_dir();
    let snapshots = list_snapshots(&directory);
    Ok(Json(SystemInfo {
        database_path: state.config.db_path.display().to_string(),
        database_size_bytes: database_size(&state.config.db_path),
        sqlite_version: crate::db::sqlite_version(&state.db).await?,
        note_count,
        in_container: Path::new("/.dockerenv").exists(),
        auth_mode,
        backups: BackupsInfo {
            directory: directory.display().to_string(),
            default_directory: state.config.backup_dir().display().to_string(),
            custom_directory: state.backup_dir_override.read().unwrap().is_some(),
            can_change_directory: is_desktop(&state),
            can_restore: is_desktop(&state),
            interval_hours: state.config.backup_interval_hours,
            keep: state.config.backup_keep,
            count: snapshots.len(),
            latest: snapshots.first().map(SnapshotInfo::from),
            offsite_url: state.config.display_replica_url(),
        },
    }))
}

async fn snapshot_now(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
) -> ApiResult<Json<SnapshotInfo>> {
    identity.require_session()?;
    let snapshot = create_snapshot(
        &state.db,
        &state.backup_dir(),
        state.config.backup_keep,
        &state.snapshot_lock,
    )
    .await
    .map_err(ApiError::internal)?;
    Ok(Json(SnapshotInfo::from(&snapshot)))
}

async fn snapshots(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
) -> ApiResult<Json<Vec<SnapshotInfo>>> {
    identity.require_session()?;
    Ok(Json(
        list_snapshots(&state.backup_dir())
            .iter()
            .map(SnapshotInfo::from)
            .collect(),
    ))
}

fn attachment(bytes: Vec<u8>, filename: &str) -> Response {
    (
        [
            (CONTENT_TYPE, "application/vnd.sqlite3".to_string()),
            (
                CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        AxumBody::from(bytes),
    )
        .into_response()
}

fn snapshot_named(state: &AppState, name: &str) -> Result<Snapshot, ApiError> {
    find_snapshot(&state.backup_dir(), name).ok_or_else(|| ApiError::not_found("No such snapshot"))
}

async fn download_snapshot(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
    P(name): P<String>,
) -> ApiResult<Response> {
    identity.require_session()?;
    let snapshot = snapshot_named(&state, &name)?;
    let bytes = tokio::fs::read(&snapshot.path)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(attachment(bytes, &name))
}

async fn restore_snapshot(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
    P(name): P<String>,
) -> ApiResult<StatusCode> {
    identity.require_session()?;
    if !is_desktop(&state) {
        return Err(ApiError::not_found("Not found"));
    }
    let snapshot = snapshot_named(&state, &name)?;
    if let Some(problem) = crate::backups::check_database_file(&snapshot.path).await {
        return Err(ApiError::bad_request(format!(
            "This snapshot can't be restored: {problem}"
        )));
    }
    request_restore(&state.config.db_path, &snapshot.path).map_err(ApiError::internal)?;
    state.restart.notify_one();
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct BackupsUpdate {
    directory: Option<String>,
}

async fn update_backups(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
    Body(body): Body<BackupsUpdate>,
) -> ApiResult<Json<SystemInfo>> {
    identity.require_session()?;
    if !is_desktop(&state) {
        return Err(ApiError::not_found("Not found"));
    }
    let directory = body
        .directory
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty())
        .map(PathBuf::from);
    if let Some(directory) = &directory {
        check_backup_dir(directory).map_err(ApiError::bad_request)?;
    }
    save_backup_dir(&state.db, directory.as_deref()).await?;
    *state.backup_dir_override.write().unwrap() = directory;
    system_info(State(state), Extension(identity)).await
}

async fn download_database(
    State(state): State<AppState>,
    Extension(identity): Extension<Identity>,
) -> ApiResult<Response> {
    identity.require_session()?;
    let workdir = std::env::temp_dir().join(format!(
        "notes-again-download-{}",
        crate::auth::secrets::token_urlsafe(8)
    ));
    let target = workdir.join("notes-again.db");
    copy_database(&state.db, &target)
        .await
        .map_err(ApiError::internal)?;
    let bytes = tokio::fs::read(&target)
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let _ = tokio::fs::remove_dir_all(&workdir).await;
    let stamp = Ts::now().0.format("%Y-%m-%d");
    Ok(attachment(bytes, &format!("notes-again-{stamp}.db")))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/system", get(system_info))
        .route("/system/snapshot", post(snapshot_now))
        .route("/system/snapshots", get(snapshots))
        .route("/system/snapshots/{name}", get(download_snapshot))
        .route("/system/snapshots/{name}/restore", post(restore_snapshot))
        .route("/system/backups", put(update_backups))
        .route("/system/database", get(download_database))
}
