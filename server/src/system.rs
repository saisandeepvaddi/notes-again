use std::path::Path;

use axum::body::Body as AxumBody;
use axum::extract::State;
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::Serialize;

use crate::auth::{Identity, effective_mode};
use crate::backups::{Snapshot, copy_database, create_snapshot, list_snapshots};
use crate::config::AuthMode;
use crate::error::{ApiError, ApiResult};
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
    let snapshots = list_snapshots(&state.config);
    Ok(Json(SystemInfo {
        database_path: state.config.db_path.display().to_string(),
        database_size_bytes: database_size(&state.config.db_path),
        sqlite_version: crate::db::sqlite_version(&state.db).await?,
        note_count,
        in_container: Path::new("/.dockerenv").exists(),
        auth_mode,
        backups: BackupsInfo {
            directory: state.config.backup_dir().display().to_string(),
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
    let snapshot = create_snapshot(&state.db, &state.config, &state.snapshot_lock)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(SnapshotInfo::from(&snapshot)))
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
    Ok((
        [
            (CONTENT_TYPE, "application/vnd.sqlite3".to_string()),
            (
                CONTENT_DISPOSITION,
                format!("attachment; filename=\"notes-again-{stamp}.db\""),
            ),
        ],
        AxumBody::from(bytes),
    )
        .into_response())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/system", get(system_info))
        .route("/system/snapshot", post(snapshot_now))
        .route("/system/database", get(download_database))
}
