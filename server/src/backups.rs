use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Utc};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Connection};

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

const BACKUP_DIR_KEY: &str = "backup_dir";
const RESTORE_MARKER_SUFFIX: &str = ".restore-pending";

fn is_snapshot_name(name: &str) -> bool {
    name.starts_with(SNAPSHOT_PREFIX)
        && name.ends_with(SNAPSHOT_SUFFIX)
        && !name.contains(['/', '\\'])
        && !name.contains("..")
}

pub fn list_snapshots(dir: &Path) -> Vec<Snapshot> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    let mut snapshots: Vec<Snapshot> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(is_snapshot_name)
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

pub fn find_snapshot(dir: &Path, name: &str) -> Option<Snapshot> {
    if !is_snapshot_name(name) {
        return None;
    }
    list_snapshots(dir)
        .into_iter()
        .find(|s| s.path.file_name().and_then(|n| n.to_str()) == Some(name))
}

pub fn prune_snapshots(dir: &Path, keep: usize) {
    for snapshot in list_snapshots(dir).into_iter().skip(keep) {
        let _ = std::fs::remove_file(snapshot.path);
    }
}

pub async fn create_snapshot(
    pool: &Pool,
    dir: &Path,
    keep: usize,
    lock: &tokio::sync::Mutex<()>,
) -> Result<Snapshot, String> {
    let _guard = lock.lock().await;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let target = dir.join(format!("{SNAPSHOT_PREFIX}{stamp}{SNAPSHOT_SUFFIX}"));
    copy_database(pool, &target).await?;
    prune_snapshots(dir, keep);
    let (created_at, size_bytes) = modified(&target).ok_or("snapshot vanished")?;
    Ok(Snapshot {
        path: target,
        created_at,
        size_bytes,
    })
}

pub fn snapshot_due(dir: &Path, interval_hours: u64) -> bool {
    if interval_hours == 0 {
        return false;
    }
    match list_snapshots(dir).first() {
        None => true,
        Some(latest) => {
            Ts::now().since(latest.created_at) >= chrono::Duration::hours(interval_hours as i64)
        }
    }
}

pub async fn load_backup_dir(pool: &Pool) -> Result<Option<PathBuf>, sqlx::Error> {
    let value: Option<String> =
        sqlx::query_scalar("SELECT value FROM device_settings WHERE key = ?")
            .bind(BACKUP_DIR_KEY)
            .fetch_optional(pool)
            .await?;
    Ok(value.filter(|v| !v.is_empty()).map(PathBuf::from))
}

pub async fn save_backup_dir(pool: &Pool, dir: Option<&Path>) -> Result<(), sqlx::Error> {
    match dir {
        Some(dir) => {
            sqlx::query("INSERT OR REPLACE INTO device_settings (key, value) VALUES (?, ?)")
                .bind(BACKUP_DIR_KEY)
                .bind(dir.to_string_lossy().to_string())
                .execute(pool)
                .await?;
        }
        None => {
            sqlx::query("DELETE FROM device_settings WHERE key = ?")
                .bind(BACKUP_DIR_KEY)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}

pub fn check_backup_dir(dir: &Path) -> Result<(), String> {
    if !dir.is_absolute() {
        return Err("Choose a full folder path.".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
    let probe = dir.join(".notes-again-write-test");
    std::fs::write(&probe, b"ok").map_err(|e| format!("Can't write to {}: {e}", dir.display()))?;
    let _ = std::fs::remove_file(probe);
    Ok(())
}

fn restore_marker(db_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}{RESTORE_MARKER_SUFFIX}", db_path.display()))
}

pub fn request_restore(db_path: &Path, snapshot: &Path) -> Result<(), String> {
    std::fs::write(
        restore_marker(db_path),
        snapshot.to_string_lossy().as_bytes(),
    )
    .map_err(|e| e.to_string())
}

pub async fn apply_pending_restore(db_path: &Path) -> Result<Option<PathBuf>, String> {
    let marker = restore_marker(db_path);
    let Ok(source) = std::fs::read_to_string(&marker) else {
        return Ok(None);
    };
    let _ = std::fs::remove_file(&marker);
    let source = PathBuf::from(source.trim());
    restore_database(&source, db_path).await?;
    Ok(Some(source))
}

pub async fn run_schedule(state: crate::state::AppState) {
    if state.config.backup_interval_hours == 0 {
        tracing::info!("Local snapshots are off (BACKUP_INTERVAL_HOURS=0).");
        return;
    }
    loop {
        let dir = state.backup_dir();
        if snapshot_due(&dir, state.config.backup_interval_hours) {
            match create_snapshot(
                &state.db,
                &dir,
                state.config.backup_keep,
                &state.snapshot_lock,
            )
            .await
            {
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
