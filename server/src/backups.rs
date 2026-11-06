use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Utc};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection};

use crate::config::Config;
use crate::db::Pool;
use crate::time::Ts;

const SNAPSHOT_PREFIX: &str = "notes-again-";
const SNAPSHOT_SUFFIX: &str = ".db";
const CHECK_EVERY: Duration = Duration::from_secs(60 * 60);

#[derive(Clone, Debug)]
pub struct Snapshot {
    pub path: PathBuf,
    pub created_at: Ts,
    pub size_bytes: u64,
}

fn modified(path: &Path) -> Option<(Ts, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    let time: DateTime<Utc> = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH).into();
    Some((Ts(time), meta.len()))
}

pub fn list_snapshots(config: &Config) -> Vec<Snapshot> {
    let Ok(entries) = std::fs::read_dir(config.backup_dir()) else {
        return vec![];
    };
    let mut snapshots: Vec<Snapshot> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(SNAPSHOT_PREFIX) && n.ends_with(SNAPSHOT_SUFFIX))
        })
        .filter_map(|path| {
            modified(&path).map(|(created_at, size_bytes)| Snapshot {
                path,
                created_at,
                size_bytes,
            })
        })
        .collect();
    snapshots.sort_by_key(|s| std::cmp::Reverse(s.created_at));
    snapshots
}

pub async fn copy_database(pool: &Pool, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let partial = target.with_file_name(format!(
        "{}.partial",
        target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("snapshot")
    ));
    let _ = std::fs::remove_file(&partial);
    sqlx::query("VACUUM INTO ?")
        .bind(partial.to_string_lossy().to_string())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    std::fs::rename(&partial, target).map_err(|e| e.to_string())
}

pub fn prune_snapshots(config: &Config, keep: usize) {
    for snapshot in list_snapshots(config).into_iter().skip(keep) {
        let _ = std::fs::remove_file(snapshot.path);
    }
}

pub async fn create_snapshot(
    pool: &Pool,
    config: &Config,
    lock: &tokio::sync::Mutex<()>,
) -> Result<Snapshot, String> {
    let _guard = lock.lock().await;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let target = config
        .backup_dir()
        .join(format!("{SNAPSHOT_PREFIX}{stamp}{SNAPSHOT_SUFFIX}"));
    copy_database(pool, &target).await?;
    prune_snapshots(config, config.backup_keep);
    let (created_at, size_bytes) = modified(&target).ok_or("snapshot vanished")?;
    Ok(Snapshot {
        path: target,
        created_at,
        size_bytes,
    })
}

pub fn snapshot_due(config: &Config) -> bool {
    if config.backup_interval_hours == 0 {
        return false;
    }
    match list_snapshots(config).first() {
        None => true,
        Some(latest) => {
            Ts::now().since(latest.created_at)
                >= chrono::Duration::hours(config.backup_interval_hours as i64)
        }
    }
}

pub async fn run_schedule(state: crate::state::AppState) {
    if state.config.backup_interval_hours == 0 {
        tracing::info!("Local snapshots are off (BACKUP_INTERVAL_HOURS=0).");
        return;
    }
    loop {
        if snapshot_due(&state.config) {
            match create_snapshot(&state.db, &state.config, &state.snapshot_lock).await {
                Ok(snapshot) => tracing::info!("Wrote local snapshot {}", snapshot.path.display()),
                Err(error) => tracing::error!("Local snapshot failed: {error}"),
            }
        }
        tokio::time::sleep(CHECK_EVERY).await;
    }
}

pub async fn check_database_file(path: &Path) -> Option<String> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let mut conn = match options.connect().await {
        Ok(conn) => conn,
        Err(e) => return Some(format!("can't open it: {e}")),
    };
    let result: Result<String, _> = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut conn)
        .await;
    let problem = match result {
        Err(e) => Some(format!("it isn't a SQLite database: {e}")),
        Ok(value) if value != "ok" => Some(format!("integrity check failed: {value}")),
        Ok(_) => {
            let notes: Option<String> = sqlx::query_scalar(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'",
            )
            .fetch_optional(&mut conn)
            .await
            .ok()
            .flatten();
            notes
                .is_none()
                .then(|| "it isn't a Notes Again database (no notes table)".to_string())
        }
    };
    let _ = conn.close().await;
    problem
}

pub async fn restore_database(source: &Path, target: &Path) -> Result<Option<PathBuf>, String> {
    if let Some(problem) = check_database_file(source).await {
        return Err(format!("Not restoring {}: {problem}", source.display()));
    }
    let mut moved_aside = None;
    if target.exists() {
        let stamp = Utc::now().format("%Y%m%d-%H%M%S");
        let aside = target.with_file_name(format!(
            "{}.before-restore-{stamp}",
            target
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("notes-again.db")
        ));
        std::fs::rename(target, &aside).map_err(|e| e.to_string())?;
        moved_aside = Some(aside);
    }
    for suffix in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", target.display()));
    }
    let partial = target.with_file_name(format!(
        "{}.partial",
        target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("notes-again.db")
    ));
    let options = SqliteConnectOptions::new().filename(source).read_only(true);
    let mut conn = options.connect().await.map_err(|e| e.to_string())?;
    sqlx::query("VACUUM INTO ?")
        .bind(partial.to_string_lossy().to_string())
        .execute(&mut conn)
        .await
        .map_err(|e| e.to_string())?;
    let _ = conn.close().await;
    std::fs::rename(&partial, target).map_err(|e| e.to_string())?;
    Ok(moved_aside)
}
