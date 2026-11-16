use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::client::{
    Pending, SyncError, batches, clear_conflict, pending_changes, record_conflict,
};
use super::payloads::{
    Kind, Payload, current_version, dump, find_row, load_base, save_base, set_applying, set_uid,
};
use super::server::{Change, Status, apply_changes};
use crate::attachments::sniff;
use crate::db::{BEGIN_WRITE, Conn};
use crate::state::AppState;
use crate::time::Ts;

const FORMAT: u32 = 1;
const VAULT_DIR: &str = "notes-again-vault";
const MAX_BATCH_BYTES: usize = 32 * 1024 * 1024;
const MAX_BATCHES_PER_PASS: usize = 200;

#[derive(Serialize, Deserialize)]
struct VaultInfo {
    format: u32,
    vault_id: String,
}

#[derive(Serialize, Deserialize)]
struct Batch {
    format: u32,
    device: String,
    seq: i64,
    changes: Vec<Change>,
}

pub enum Store {
    Folder(PathBuf),
}

impl Store {
    pub fn folder(root: &Path) -> Store {
        Store::Folder(root.join(VAULT_DIR))
    }

    async fn list(&self, dir: &str) -> Result<Vec<String>, SyncError> {
        let Store::Folder(root) = self;
        let path = root.join(dir);
        let mut names = vec![];
        let mut entries = match tokio::fs::read_dir(&path).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(names),
            Err(error) => return Err(io(error)),
        };
        while let Some(entry) = entries.next_entry().await.map_err(io)? {
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
        names.sort();
        Ok(names)
    }

    async fn get(&self, path: &str) -> Result<Option<Vec<u8>>, SyncError> {
        let Store::Folder(root) = self;
        match tokio::fs::read(root.join(path)).await {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(io(error)),
        }
    }

    async fn put_new(&self, path: &str, bytes: &[u8]) -> Result<bool, SyncError> {
        let Store::Folder(root) = self;
        let target = root.join(path);
        if let Some(parent) = target.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(io)?;
        }
        if tokio::fs::try_exists(&target).await.map_err(io)? {
            return Ok(false);
        }
        let temp = target.with_extension(format!("tmp-{}", crate::db::models::new_uid()));
        tokio::fs::write(&temp, bytes).await.map_err(io)?;
        tokio::fs::rename(&temp, &target).await.map_err(io)?;
        Ok(true)
    }
}

fn io(error: std::io::Error) -> SyncError {
    SyncError::Other(format!("The sync folder is not available: {error}"))
}

fn batch_name(seq: i64) -> String {
    format!("{seq:010}.json")
}

fn parse_seq(name: &str) -> Option<i64> {
    name.strip_suffix(".json")
        .filter(|stem| stem.len() == 10 && stem.bytes().all(|b| b.is_ascii_digit()))
        .and_then(|stem| stem.parse().ok())
}

fn valid_device(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

pub struct VaultRow {
    pub path: String,
    pub vault_id: String,
    pub device_id: String,
    pub pushed_version: i64,
    pub next_seq: i64,
    pub last_synced_at: Option<Ts>,
    pub last_changed_at: Option<Ts>,
    pub last_error: Option<String>,
}

pub async fn vault_row(state: &AppState) -> Result<Option<VaultRow>, sqlx::Error> {
    #[allow(clippy::type_complexity)]
    let row: Option<(String, String, String, i64, i64, Option<Ts>, Option<Ts>, Option<String>)> =
        sqlx::query_as(
            "SELECT path, vault_id, device_id, pushed_version, next_seq, last_synced_at, last_changed_at, last_error \
             FROM vault_sync WHERE id = 1",
        )
        .fetch_optional(&state.db)
        .await?;
    Ok(row.map(
        |(
            path,
            vault_id,
            device_id,
            pushed_version,
            next_seq,
            last_synced_at,
            last_changed_at,
            last_error,
        )| VaultRow {
            path,
            vault_id,
            device_id,
            pushed_version,
            next_seq,
            last_synced_at,
            last_changed_at,
            last_error,
        },
    ))
}

pub async fn connect(state: &AppState, folder: &Path) -> Result<(), SyncError> {
    if sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sync_remote")
        .fetch_one(&state.db)
        .await?
        > 0
    {
        return Err(SyncError::Other(
            "This device already syncs with a server. Disconnect it first.".into(),
        ));
    }
    if !folder.is_dir() {
        return Err(SyncError::Other(
            "Choose an existing folder for the sync vault.".into(),
        ));
    }
    let store = Store::folder(folder);
    let info = match store.get("vault.json").await? {
        Some(bytes) => {
            let info: VaultInfo = serde_json::from_slice(&bytes)
                .map_err(|_| SyncError::Other("The vault in that folder is unreadable.".into()))?;
            if info.format != FORMAT {
                return Err(SyncError::Other(
                    "That vault was made by a newer Notes Again. Update the app.".into(),
                ));
            }
            info
        }
        None => {
            let info = VaultInfo {
                format: FORMAT,
                vault_id: crate::db::models::new_uid(),
            };
            let bytes = serde_json::to_vec(&info).unwrap_or_default();
            store.put_new("vault.json", &bytes).await?;
            match store.get("vault.json").await? {
                Some(bytes) => serde_json::from_slice(&bytes).map_err(|_| {
                    SyncError::Other("The vault in that folder is unreadable.".into())
                })?,
                None => info,
            }
        }
    };
    sqlx::query(
        "INSERT OR REPLACE INTO vault_sync (id, path, vault_id, device_id, pushed_version, next_seq) \
         VALUES (1, ?, ?, ?, 0, 1)",
    )
    .bind(folder.to_string_lossy().to_string())
    .bind(&info.vault_id)
    .bind(crate::db::models::new_uid())
    .execute(&state.db)
    .await?;
    sqlx::query("DELETE FROM vault_cursors")
        .execute(&state.db)
        .await?;
    Ok(())
}

pub async fn disconnect(state: &AppState) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM vault_sync")
        .execute(&state.db)
        .await?;
    sqlx::query("DELETE FROM vault_cursors")
        .execute(&state.db)
        .await?;
    Ok(())
}

async fn cursor(conn: &mut Conn, device: &str) -> Result<i64, sqlx::Error> {
    Ok(
        sqlx::query_scalar("SELECT seq FROM vault_cursors WHERE device = ?")
            .bind(device)
            .fetch_optional(conn)
            .await?
            .unwrap_or(0),
    )
}

fn text_of(payload: &Payload, key: &str) -> Option<String> {
    payload.get(key).and_then(Value::as_str).map(str::to_string)
}

async fn apply_batch(conn: &mut Conn, batch: Vec<Change>) -> Result<usize, sqlx::Error> {
    let mut applied = 0;
    let mut pending = batch;
    for round in 0..2 {
        let results = apply_changes(conn, pending.clone()).await?;
        let mut retry = vec![];
        let mut ordered = pending.clone();
        ordered.sort_by_key(|c| c.kind.index());
        for (change, result) in ordered.iter().zip(results.iter()) {
            match result.status {
                Status::Remapped if round == 0 => {
                    if let Some(mine) = result.server_uid.as_deref()
                        && let Some(found) = find_row(conn, change.kind, mine).await?
                    {
                        save_base(conn, change.kind, mine, None).await?;
                        set_uid(conn, change.kind, found.id, &change.uid).await?;
                    }
                    retry.push(change.clone());
                    continue;
                }
                Status::Deleted => {
                    save_base(conn, change.kind, &change.uid, None).await?;
                    clear_conflict(conn, &change.uid).await?;
                    applied += 1;
                    continue;
                }
                _ => {}
            }
            let Some(theirs) = &change.data else {
                continue;
            };
            save_base(conn, change.kind, &change.uid, Some(theirs)).await?;
            let now = dump(conn, change.kind, &change.uid).await?;
            if now.as_ref() != Some(theirs) {
                sqlx::query("DELETE FROM sync_echoes WHERE kind = ? AND uid = ?")
                    .bind(change.kind.as_str())
                    .bind(&change.uid)
                    .execute(&mut *conn)
                    .await?;
            }
            if change.kind == Kind::Note {
                let same = now.as_ref().is_some_and(|mine| {
                    text_of(mine, "name") == text_of(theirs, "name")
                        && text_of(mine, "content") == text_of(theirs, "content")
                });
                if result.status == Status::Conflict && !same {
                    record_conflict(conn, &change.uid, theirs).await?;
                } else if same {
                    clear_conflict(conn, &change.uid).await?;
                }
            }
            applied += 1;
        }
        if retry.is_empty() {
            break;
        }
        pending = retry;
    }
    Ok(applied)
}

async fn pull(state: &AppState, store: &Store, me: &str) -> Result<usize, SyncError> {
    let mut applied = 0;
    let mut budget = MAX_BATCHES_PER_PASS;
    for device in store.list("devices").await? {
        if device == me || !valid_device(&device) {
            continue;
        }
        let mut files: Vec<i64> = store
            .list(&format!("devices/{device}"))
            .await?
            .iter()
            .filter_map(|name| parse_seq(name))
            .collect();
        files.sort_unstable();
        let mut next = {
            let mut conn = state.db.acquire().await?;
            cursor(&mut conn, &device).await? + 1
        };
        while files.binary_search(&next).is_ok() && budget > 0 {
            let Some(bytes) = store
                .get(&format!("devices/{device}/{}", batch_name(next)))
                .await?
            else {
                break;
            };
            let Ok(batch) = serde_json::from_slice::<Batch>(&bytes) else {
                break;
            };
            if batch.format != FORMAT || batch.device != device || batch.seq != next {
                break;
            }
            let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
            set_applying(&mut tx, true).await?;
            applied += apply_batch(&mut tx, batch.changes).await?;
            set_applying(&mut tx, false).await?;
            sqlx::query(
                "INSERT INTO vault_cursors (device, seq) VALUES (?, ?) \
                 ON CONFLICT(device) DO UPDATE SET seq = excluded.seq",
            )
            .bind(&device)
            .bind(next)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            next += 1;
            budget -= 1;
        }
    }
    Ok(applied)
}

async fn settle(conn: &mut Conn, pushed: i64) -> Result<(), sqlx::Error> {
    let current = current_version(conn).await?;
    if current > pushed && pending_changes(conn, pushed, current).await?.is_empty() {
        sqlx::query("UPDATE vault_sync SET pushed_version = ? WHERE id = 1")
            .bind(current)
            .execute(conn)
            .await?;
    }
    Ok(())
}

async fn push(state: &AppState, store: &Store, row: &VaultRow) -> Result<usize, SyncError> {
    let mut conn = state.db.acquire().await?;
    let until = current_version(&mut conn).await?;
    let pending: Vec<Pending> = pending_changes(&mut conn, row.pushed_version, until).await?;
    drop(conn);
    let count = pending.len();
    let mut seq = row.next_seq;
    for batch in batches(pending) {
        let mut changes = vec![];
        {
            let mut conn = state.db.acquire().await?;
            for item in &batch {
                let data = if item.deleted {
                    None
                } else {
                    dump(&mut conn, item.kind, &item.uid).await?
                };
                let base = load_base(&mut conn, item.kind, &item.uid).await?;
                changes.push(Change {
                    kind: item.kind,
                    uid: item.uid.clone(),
                    base,
                    data,
                });
            }
        }
        let bytes = serde_json::to_vec(&Batch {
            format: FORMAT,
            device: row.device_id.clone(),
            seq,
            changes: changes.clone(),
        })
        .map_err(|e| SyncError::Other(e.to_string()))?;
        if bytes.len() > MAX_BATCH_BYTES {
            return Err(SyncError::Other("A sync batch was too large.".into()));
        }
        if !store
            .put_new(
                &format!("devices/{}/{}", row.device_id, batch_name(seq)),
                &bytes,
            )
            .await?
        {
            return Err(SyncError::Other(
                "The sync folder already has a batch with this number. Disconnect and connect again."
                    .into(),
            ));
        }
        let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
        for change in &changes {
            save_base(&mut tx, change.kind, &change.uid, change.data.as_ref()).await?;
        }
        seq += 1;
        sqlx::query("UPDATE vault_sync SET next_seq = ? WHERE id = 1")
            .bind(seq)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }
    let mut conn = state.db.acquire().await?;
    sqlx::query("UPDATE vault_sync SET pushed_version = ? WHERE id = 1")
        .bind(until)
        .execute(&mut *conn)
        .await?;
    settle(&mut conn, until).await?;
    Ok(count)
}

async fn sync_blobs(state: &AppState, store: &Store) -> Result<(), SyncError> {
    let remote: HashSet<String> = store.list("blobs").await?.into_iter().collect();
    let local: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT b.hash FROM attachment_blobs b WHERE b.hash IN (SELECT hash FROM attachments)",
    )
    .fetch_all(&state.db)
    .await?;
    for hash in local.iter().filter(|hash| !remote.contains(*hash)) {
        let data: Option<Vec<u8>> =
            sqlx::query_scalar("SELECT data FROM attachment_blobs WHERE hash = ?")
                .bind(hash)
                .fetch_optional(&state.db)
                .await?;
        if let Some(data) = data {
            store.put_new(&format!("blobs/{hash}"), &data).await?;
        }
    }
    let wanted: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT hash FROM attachments WHERE hash NOT IN (SELECT hash FROM attachment_blobs) LIMIT 50",
    )
    .fetch_all(&state.db)
    .await?;
    for hash in wanted {
        let Some(data) = store.get(&format!("blobs/{hash}")).await? else {
            continue;
        };
        if hex::encode(Sha256::digest(&data)) != hash {
            continue;
        }
        let Some((mime, limit)) = sniff(&data) else {
            continue;
        };
        if data.len() > limit {
            continue;
        }
        sqlx::query(
            "INSERT OR IGNORE INTO attachment_blobs (hash, mime, size, data) VALUES (?, ?, ?, ?)",
        )
        .bind(&hash)
        .bind(mime)
        .bind(data.len() as i64)
        .bind(&data)
        .execute(&state.db)
        .await?;
    }
    Ok(())
}

pub struct VaultOutcome {
    pub pushed: usize,
    pub pulled: usize,
}

pub async fn sync_once(state: &AppState) -> Result<VaultOutcome, SyncError> {
    let row = vault_row(state).await?.ok_or(SyncError::NotConnected)?;
    let store = Store::folder(Path::new(&row.path));
    let pulled = pull(state, &store, &row.device_id).await?;
    let row = vault_row(state).await?.ok_or(SyncError::NotConnected)?;
    let pushed = push(state, &store, &row).await?;
    let _ = sync_blobs(state, &store).await;
    let now = Ts::now();
    sqlx::query(
        "UPDATE vault_sync SET last_synced_at = ?, \
         last_changed_at = CASE WHEN ? THEN ? ELSE last_changed_at END, last_error = NULL WHERE id = 1",
    )
    .bind(now)
    .bind(pulled > 0)
    .bind(now)
    .execute(&state.db)
    .await?;
    Ok(VaultOutcome { pushed, pulled })
}

pub fn describe_error(error: &SyncError) -> String {
    match error {
        SyncError::Other(message) => message.clone(),
        SyncError::NotConnected => "Not connected".into(),
        _ => "Sync through the folder failed.".into(),
    }
}

pub async fn run(state: &AppState) {
    let Ok(Some(_)) = vault_row(state).await else {
        return;
    };
    let _guard = state.sync_lock.lock().await;
    state
        .sync_running
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let outcome = sync_once(state).await;
    state
        .sync_running
        .store(false, std::sync::atomic::Ordering::SeqCst);
    if let Err(error) = outcome {
        if matches!(error, SyncError::NotConnected) {
            return;
        }
        tracing::warn!("Sync through the vault folder failed: {error:?}");
        let _ = sqlx::query("UPDATE vault_sync SET last_error = ? WHERE id = 1")
            .bind(describe_error(&error))
            .execute(&state.db)
            .await;
    }
}
