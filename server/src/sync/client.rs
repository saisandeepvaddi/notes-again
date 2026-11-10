use std::collections::{HashMap, HashSet};
use std::sync::atomic::Ordering;

use serde_json::{Value, json};

use super::payloads::{
    Kind, Payload, RowRef, SETTINGS_UID, TEXT_FIELDS, apply, current_version, delete_row, dump,
    find_by_name, find_row, load_base, save_base, set_applying, set_uid,
};
use super::server::{ChangeResult, PullResponse, Status};
use crate::db::{BEGIN_WRITE, Conn};
use crate::state::AppState;
use crate::time::Ts;

const NOTES_PER_PUSH: usize = 100;
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

#[derive(Debug)]
pub enum SyncError {
    Status(u16),
    Transport(String),
    Other(String),
    NotConnected,
}

impl From<sqlx::Error> for SyncError {
    fn from(e: sqlx::Error) -> Self {
        SyncError::Other(e.to_string())
    }
}

impl From<reqwest::Error> for SyncError {
    fn from(e: reqwest::Error) -> Self {
        match e.status() {
            Some(status) => SyncError::Status(status.as_u16()),
            None if e.is_decode() => SyncError::Other(e.to_string()),
            None => SyncError::Transport(e.to_string()),
        }
    }
}

pub fn describe_error(url: &str, error: &SyncError) -> String {
    match error {
        SyncError::Status(401 | 403) => {
            "The server no longer accepts this desktop. Disconnect and connect again.".into()
        }
        SyncError::Status(404) => {
            "The server doesn't support sync yet. Update it to the latest Notes Again.".into()
        }
        SyncError::Status(code) => format!("The server answered with an error ({code})."),
        SyncError::Transport(_) => {
            format!("Couldn't reach {url}. Changes will sync when it's back.")
        }
        SyncError::Other(message) => message.clone(),
        SyncError::NotConnected => "Not connected".into(),
    }
}

pub struct Remote {
    pub url: String,
    pub token: Option<String>,
    http: reqwest::Client,
}

impl Remote {
    pub fn new(url: &str, token: Option<&str>) -> Remote {
        Remote::pinned(url, token, None)
    }

    pub fn pinned(url: &str, token: Option<&str>, pin: Option<&str>) -> Remote {
        let mut builder = reqwest::Client::builder().timeout(REQUEST_TIMEOUT);
        if let Some(pin) = pin.filter(|p| !p.is_empty()) {
            builder = builder.use_preconfigured_tls(crate::tls::pinned_client_config(pin));
        }
        Remote {
            url: url.trim_end_matches('/').to_string(),
            token: token.map(str::to_string),
            http: builder.build().expect("an HTTP client"),
        }
    }

    pub fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let builder = self.http.request(method, format!("{}{path}", self.url));
        match &self.token {
            Some(token) => builder.bearer_auth(token),
            None => builder,
        }
    }
}

struct Pending {
    kind: Kind,
    uid: String,
    version: i64,
    deleted: bool,
}

async fn echoes(conn: &mut Conn) -> Result<HashMap<(String, String), i64>, sqlx::Error> {
    let rows: Vec<(String, String, i64)> =
        sqlx::query_as("SELECT kind, uid, version FROM sync_echoes")
            .fetch_all(conn)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(kind, uid, version)| ((kind, uid), version))
        .collect())
}

async fn is_echo(
    conn: &mut Conn,
    kind: Kind,
    uid: &str,
    version: i64,
) -> Result<bool, sqlx::Error> {
    let echoed: Option<i64> =
        sqlx::query_scalar("SELECT version FROM sync_echoes WHERE kind = ? AND uid = ?")
            .bind(kind.as_str())
            .bind(uid)
            .fetch_optional(conn)
            .await?;
    Ok(echoed == Some(version))
}

async fn settle_pushed_version(conn: &mut Conn, pushed: i64) -> Result<(), sqlx::Error> {
    let current = current_version(conn).await?;
    if current > pushed && pending_changes(conn, pushed, current).await?.is_empty() {
        sqlx::query("UPDATE sync_remote SET pushed_version = ? WHERE id = 1")
            .bind(current)
            .execute(conn)
            .await?;
    }
    Ok(())
}

async fn pending_changes(
    conn: &mut Conn,
    since: i64,
    until: i64,
) -> Result<Vec<Pending>, sqlx::Error> {
    let echoed = echoes(&mut *conn).await?;
    let conflicted: HashSet<String> = sqlx::query_scalar("SELECT note_uid FROM sync_conflicts")
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .collect();
    let mut pending = vec![];
    let settings: Option<i64> =
        sqlx::query_scalar("SELECT sync_version FROM settings WHERE id = 1")
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(version) = settings.filter(|v| since < *v && *v <= until) {
        pending.push(Pending {
            kind: Kind::Settings,
            uid: SETTINGS_UID.into(),
            version,
            deleted: false,
        });
    }
    for kind in [Kind::Project, Kind::Tag, Kind::Note, Kind::Attachment] {
        let rows: Vec<(String, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT uid, sync_version FROM {} WHERE sync_version > ? AND sync_version <= ?",
            kind.table()
        )))
        .bind(since)
        .bind(until)
        .fetch_all(&mut *conn)
        .await?;
        for (uid, version) in rows {
            if kind == Kind::Note && conflicted.contains(&uid) {
                continue;
            }
            pending.push(Pending {
                kind,
                uid,
                version,
                deleted: false,
            });
        }
    }
    let tombstones: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT kind, uid, version FROM sync_tombstones WHERE version > ? AND version <= ?",
    )
    .bind(since)
    .bind(until)
    .fetch_all(&mut *conn)
    .await?;
    for (kind, uid, version) in tombstones {
        if let Some(kind) = Kind::parse(&kind) {
            pending.push(Pending {
                kind,
                uid,
                version,
                deleted: true,
            });
        }
    }
    pending
        .retain(|p| echoed.get(&(p.kind.as_str().to_string(), p.uid.clone())) != Some(&p.version));
    pending.sort_by_key(|p| (p.kind.index(), p.version));
    Ok(pending)
}

fn batches(pending: Vec<Pending>) -> Vec<Vec<Pending>> {
    let (meta, notes): (Vec<Pending>, Vec<Pending>) =
        pending.into_iter().partition(|p| p.kind != Kind::Note);
    let mut notes = notes.into_iter();
    let mut first = meta;
    first.extend(notes.by_ref().take(NOTES_PER_PUSH));
    let mut out = vec![first];
    loop {
        let batch: Vec<Pending> = notes.by_ref().take(NOTES_PER_PUSH).collect();
        if batch.is_empty() {
            break;
        }
        out.push(batch);
    }
    out.into_iter().filter(|b| !b.is_empty()).collect()
}

fn unchanged_since(row: &Option<RowRef>, item: &Pending) -> bool {
    row.as_ref().is_some_and(|r| r.sync_version == item.version)
}

async fn record_conflict(conn: &mut Conn, uid: &str, theirs: &Payload) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO sync_conflicts (note_uid, their_name, their_content, detected_at) VALUES (?, ?, ?, ?) \
         ON CONFLICT(note_uid) DO UPDATE SET their_name = excluded.their_name, their_content = excluded.their_content, \
         detected_at = excluded.detected_at",
    )
    .bind(uid)
    .bind(theirs.get("name").and_then(Value::as_str).unwrap_or_default())
    .bind(theirs.get("content").and_then(Value::as_str).unwrap_or_default())
    .bind(Ts::now())
    .execute(conn)
    .await?;
    Ok(())
}

async fn clear_conflict(conn: &mut Conn, uid: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM sync_conflicts WHERE note_uid = ?")
        .bind(uid)
        .execute(conn)
        .await?;
    Ok(())
}

async fn handle_result(
    conn: &mut Conn,
    item: &Pending,
    result: &ChangeResult,
) -> Result<(), SyncError> {
    let row = find_row(conn, item.kind, &item.uid).await?;
    let echoed = match &row {
        Some(row) => is_echo(conn, item.kind, &item.uid, row.sync_version).await?,
        None => false,
    };
    let data = result.data.clone();
    match result.status {
        Status::Deleted => {
            if let Some(row) = &row
                && (item.deleted || echoed || unchanged_since(&Some(row.clone()), item))
            {
                delete_row(conn, item.kind, row).await?;
            }
            save_base(conn, item.kind, &item.uid, None).await?;
            clear_conflict(conn, &item.uid).await?;
            return Ok(());
        }
        Status::Remapped => {
            let server_uid = result
                .server_uid
                .clone()
                .ok_or(SyncError::Other("missing server uid".into()))?;
            if let Some(row) = &row {
                set_uid(conn, item.kind, row.id, &server_uid).await?;
            }
            save_base(conn, item.kind, &item.uid, None).await?;
            if let Some(data) = &data {
                apply(conn, item.kind, &server_uid, data, false).await?;
            }
            save_base(conn, item.kind, &server_uid, data.as_ref()).await?;
            return Ok(());
        }
        _ => {}
    }
    let unchanged = item.deleted || echoed || unchanged_since(&row, item);
    let Some(data) = data else {
        return Ok(());
    };
    if result.status == Status::Conflict {
        if unchanged {
            apply(conn, item.kind, &item.uid, &data, true).await?;
        }
        record_conflict(conn, &item.uid, &data).await?;
    } else if unchanged {
        apply(conn, item.kind, &item.uid, &data, false).await?;
    }
    save_base(conn, item.kind, &item.uid, Some(&data)).await?;
    Ok(())
}

async fn remote_row(state: &AppState) -> Result<crate::db::models::SyncRemoteRow, SyncError> {
    sqlx::query_as("SELECT * FROM sync_remote WHERE id = 1")
        .fetch_optional(&state.db)
        .await?
        .ok_or(SyncError::NotConnected)
}

async fn push(state: &AppState, remote: &Remote) -> Result<usize, SyncError> {
    let row = remote_row(state).await?;
    let mut conn = state.db.acquire().await?;
    let since = row.pushed_version;
    let until = current_version(&mut conn).await?;
    let pending = pending_changes(&mut conn, since, until).await?;
    drop(conn);
    let count = pending.len();
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
                changes.push(
                    json!({ "kind": item.kind, "uid": item.uid, "base": base, "data": data }),
                );
            }
        }
        let response: Value = remote
            .request(reqwest::Method::POST, "/api/sync/push")
            .json(&json!({ "changes": changes }))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let results: Vec<ChangeResult> = serde_json::from_value(response["results"].clone())
            .map_err(|e| SyncError::Other(e.to_string()))?;
        let by_key: HashMap<(Kind, String), &ChangeResult> = results
            .iter()
            .map(|r| ((r.kind, r.uid.clone()), r))
            .collect();
        let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
        set_applying(&mut tx, true).await?;
        for item in &batch {
            if let Some(result) = by_key.get(&(item.kind, item.uid.clone())) {
                handle_result(&mut tx, item, result).await?;
            }
        }
        set_applying(&mut tx, false).await?;
        tx.commit().await?;
    }
    let mut conn = state.db.acquire().await?;
    sqlx::query("UPDATE sync_remote SET pushed_version = ? WHERE id = 1")
        .bind(until)
        .execute(&mut *conn)
        .await?;
    settle_pushed_version(&mut conn, until).await?;
    Ok(count)
}

async fn apply_pulled(
    conn: &mut Conn,
    kind: Kind,
    uid: &str,
    data: Option<&Payload>,
    pushed: i64,
) -> Result<bool, sqlx::Error> {
    let row = find_row(conn, kind, uid).await?;
    if let Some(found) = &row
        && found.sync_version > pushed
        && !is_echo(conn, kind, uid, found.sync_version).await?
    {
        return Ok(false);
    }
    let Some(data) = data else {
        if let Some(row) = &row {
            delete_row(conn, kind, row).await?;
        }
        save_base(conn, kind, uid, None).await?;
        clear_conflict(conn, uid).await?;
        return Ok(row.is_some());
    };
    if row.is_some() && load_base(conn, kind, uid).await?.as_ref() == Some(data) {
        return Ok(false);
    }
    if row.is_none() && matches!(kind, Kind::Project | Kind::Tag) {
        let name = data.get("name").and_then(Value::as_str).unwrap_or_default();
        if let Some(same) = find_by_name(conn, kind, name).await? {
            save_base(conn, kind, &same.uid, None).await?;
            set_uid(conn, kind, same.id, uid).await?;
        }
    }
    let conflicted = kind == Kind::Note
        && sqlx::query_scalar::<_, String>(
            "SELECT note_uid FROM sync_conflicts WHERE note_uid = ?",
        )
        .bind(uid)
        .fetch_optional(&mut *conn)
        .await?
        .is_some();
    match (&row, conflicted) {
        (Some(row), true) => {
            apply(conn, kind, uid, data, true).await?;
            let same = TEXT_FIELDS.iter().all(|name| {
                let mine = if *name == "name" {
                    row.name.as_deref()
                } else {
                    row.content.as_deref()
                };
                data.get(*name).and_then(Value::as_str) == mine
            });
            if same {
                clear_conflict(conn, uid).await?;
            } else {
                record_conflict(conn, uid, data).await?;
            }
        }
        _ => apply(conn, kind, uid, data, false).await?,
    }
    save_base(conn, kind, uid, Some(data)).await?;
    Ok(true)
}

async fn pull(state: &AppState, remote: &Remote) -> Result<usize, SyncError> {
    let mut applied = 0;
    loop {
        let row = remote_row(state).await?;
        let page: PullResponse = remote
            .request(reqwest::Method::GET, "/api/sync/pull")
            .query(&[("since", row.pulled_version)])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let mut changes = page.changes;
        changes.sort_by_key(|c| (c.data.is_none(), c.kind.index()));
        let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
        set_applying(&mut tx, true).await?;
        for change in &changes {
            if apply_pulled(
                &mut tx,
                change.kind,
                &change.uid,
                change.data.as_ref(),
                row.pushed_version,
            )
            .await?
            {
                applied += 1;
            }
        }
        set_applying(&mut tx, false).await?;
        sqlx::query("UPDATE sync_remote SET pulled_version = ? WHERE id = 1")
            .bind(page.version)
            .execute(&mut *tx)
            .await?;
        settle_pushed_version(&mut tx, row.pushed_version).await?;
        tx.commit().await?;
        if !page.more {
            return Ok(applied);
        }
    }
}

pub struct SyncOutcome {
    pub pushed: usize,
    pub pulled: usize,
}

pub async fn sync_once(state: &AppState, remote: &Remote) -> Result<SyncOutcome, SyncError> {
    let pushed = push(state, remote).await?;
    let _ = super::blobs::upload_missing(state, remote).await;
    let pulled = pull(state, remote).await?;
    let _ = super::blobs::download_missing(state, remote).await;
    let now = Ts::now();
    sqlx::query(
        "UPDATE sync_remote SET last_synced_at = ?, last_changed_at = CASE WHEN ? THEN ? ELSE last_changed_at END, \
         last_error = NULL WHERE id = 1",
    )
    .bind(now)
    .bind(pulled > 0)
    .bind(now)
    .execute(&state.db)
    .await?;
    Ok(SyncOutcome { pushed, pulled })
}

pub async fn run_sync(state: &AppState) {
    let Ok(row) = remote_row(state).await else {
        return;
    };
    let _guard = state.sync_lock.lock().await;
    state.sync_running.store(true, Ordering::SeqCst);
    let remote = Remote::pinned(&row.url, Some(&row.token), row.pinned_cert.as_deref());
    let outcome = sync_once(state, &remote).await;
    state.sync_running.store(false, Ordering::SeqCst);
    if let Err(error) = outcome {
        if matches!(error, SyncError::NotConnected) {
            return;
        }
        tracing::warn!("Sync with {} failed: {error:?}", row.url);
        let _ = sqlx::query("UPDATE sync_remote SET last_error = ? WHERE id = 1")
            .bind(describe_error(&row.url, &error))
            .execute(&state.db)
            .await;
    }
}

pub async fn resolve_conflict(
    state: &AppState,
    note_uid: &str,
    name: &str,
    content: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let conflict: Option<String> =
        sqlx::query_scalar("SELECT note_uid FROM sync_conflicts WHERE note_uid = ?")
            .bind(note_uid)
            .fetch_optional(&mut *tx)
            .await?;
    let note = find_row(&mut tx, Kind::Note, note_uid).await?;
    let (Some(_), Some(note)) = (conflict, note) else {
        return Ok(false);
    };
    sqlx::query("UPDATE notes SET name = ?, content = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(content)
        .bind(Ts::now())
        .bind(note.id)
        .execute(&mut *tx)
        .await?;
    clear_conflict(&mut tx, note_uid).await?;
    tx.commit().await?;
    Ok(true)
}
