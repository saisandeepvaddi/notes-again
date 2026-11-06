use std::collections::HashMap;

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::merge::{merge_note, merge_record};
use super::payloads::{
    Kind, Payload, SETTINGS_UID, apply, current_version, delete_row, dump, find_by_name, find_row,
    tombstoned,
};
use crate::db::{BEGIN_WRITE, Conn};
use crate::error::{ApiResult, Body, Q};
use crate::params::check_range;
use crate::state::AppState;

const MAX_PULL: i64 = 500;

#[derive(Deserialize)]
pub struct Change {
    pub kind: Kind,
    pub uid: String,
    #[serde(default)]
    pub base: Option<Payload>,
    #[serde(default)]
    pub data: Option<Payload>,
}

#[derive(Deserialize)]
struct PushBody {
    changes: Vec<Change>,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Ok,
    Conflict,
    Remapped,
    Deleted,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ChangeResult {
    pub kind: Kind,
    pub uid: String,
    pub status: Status,
    #[serde(default)]
    pub server_uid: Option<String>,
    #[serde(default)]
    pub data: Option<Payload>,
}

#[derive(Serialize)]
struct PushResponse {
    results: Vec<ChangeResult>,
}

#[derive(Serialize, Deserialize)]
pub struct PulledChange {
    pub kind: Kind,
    pub uid: String,
    #[serde(default)]
    pub data: Option<Payload>,
}

#[derive(Serialize, Deserialize)]
pub struct PullResponse {
    pub version: i64,
    pub more: bool,
    pub changes: Vec<PulledChange>,
}

fn alias(payload: Option<&Payload>, aliases: &HashMap<String, String>) -> Option<Payload> {
    let mut aliased = payload?.clone();
    if aliases.is_empty() {
        return Some(aliased);
    }
    if let Some(Value::String(project)) = aliased.get("project")
        && let Some(target) = aliases.get(project)
    {
        aliased.insert("project".into(), Value::String(target.clone()));
    }
    if let Some(Value::Array(tags)) = aliased.get("tags") {
        let mut mapped: Vec<String> = tags
            .iter()
            .filter_map(Value::as_str)
            .map(|uid| aliases.get(uid).cloned().unwrap_or_else(|| uid.to_string()))
            .collect();
        mapped.sort();
        mapped.dedup();
        aliased.insert(
            "tags".into(),
            Value::Array(mapped.into_iter().map(Value::String).collect()),
        );
    }
    Some(aliased)
}

async fn result(
    conn: &mut Conn,
    change: &Change,
    status: Status,
    uid: Option<&str>,
    server_uid: Option<String>,
) -> Result<ChangeResult, sqlx::Error> {
    let data = match uid {
        Some(uid) => dump(conn, change.kind, uid).await?,
        None => None,
    };
    Ok(ChangeResult {
        kind: change.kind,
        uid: change.uid.clone(),
        status,
        server_uid,
        data,
    })
}

async fn push_deletion(conn: &mut Conn, change: &Change) -> Result<ChangeResult, sqlx::Error> {
    let Some(row) = find_row(conn, change.kind, &change.uid).await? else {
        return result(conn, change, Status::Deleted, None, None).await;
    };
    let current = dump(conn, change.kind, &change.uid).await?;
    if change.base.is_none() || current == change.base {
        delete_row(conn, change.kind, &row).await?;
        return result(conn, change, Status::Deleted, None, None).await;
    }
    result(conn, change, Status::Ok, Some(&change.uid), None).await
}

async fn push_named(
    conn: &mut Conn,
    change: &Change,
    aliases: &mut HashMap<String, String>,
) -> Result<ChangeResult, sqlx::Error> {
    let data = change.data.clone().unwrap_or_default();
    let name = data
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if find_row(conn, change.kind, &change.uid).await?.is_none() {
        if change.base.as_ref() == Some(&data) && tombstoned(conn, change.kind, &change.uid).await?
        {
            return result(conn, change, Status::Deleted, None, None).await;
        }
        if let Some(same) = find_by_name(conn, change.kind, &name).await? {
            aliases.insert(change.uid.clone(), same.uid.clone());
            return result(
                conn,
                change,
                Status::Remapped,
                Some(&same.uid),
                Some(same.uid.clone()),
            )
            .await;
        }
        apply(conn, change.kind, &change.uid, &data, false).await?;
        return result(conn, change, Status::Ok, Some(&change.uid), None).await;
    }
    let Some(base) = &change.base else {
        return result(conn, change, Status::Ok, Some(&change.uid), None).await;
    };
    let server = dump(conn, change.kind, &change.uid)
        .await?
        .unwrap_or_default();
    let mut merged = merge_record(base, &server, &data);
    let merged_name = merged
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if let Some(other) = find_by_name(conn, change.kind, &merged_name).await?
        && other.uid != change.uid
    {
        merged.insert(
            "name".into(),
            server.get("name").cloned().unwrap_or(Value::Null),
        );
    }
    if merged != server {
        apply(conn, change.kind, &change.uid, &merged, false).await?;
    }
    result(conn, change, Status::Ok, Some(&change.uid), None).await
}

async fn push_settings(conn: &mut Conn, change: &Change) -> Result<ChangeResult, sqlx::Error> {
    let data = change.data.clone().unwrap_or_default();
    let exists = find_row(conn, Kind::Settings, SETTINGS_UID)
        .await?
        .is_some();
    match (&change.base, exists) {
        (Some(base), true) => {
            let server = dump(conn, Kind::Settings, SETTINGS_UID)
                .await?
                .unwrap_or_default();
            let merged = merge_record(base, &server, &data);
            apply(conn, Kind::Settings, SETTINGS_UID, &merged, false).await?;
        }
        (_, false) => apply(conn, Kind::Settings, SETTINGS_UID, &data, false).await?,
        (None, true) => {}
    }
    result(conn, change, Status::Ok, Some(SETTINGS_UID), None).await
}

async fn push_note(
    conn: &mut Conn,
    change: &Change,
    aliases: &HashMap<String, String>,
) -> Result<ChangeResult, sqlx::Error> {
    let data = alias(change.data.as_ref(), aliases).unwrap_or_default();
    let base = alias(change.base.as_ref(), aliases);
    if find_row(conn, Kind::Note, &change.uid).await?.is_none() {
        if base.as_ref() == Some(&data) && tombstoned(conn, Kind::Note, &change.uid).await? {
            return result(conn, change, Status::Deleted, None, None).await;
        }
        apply(conn, Kind::Note, &change.uid, &data, false).await?;
        return result(conn, change, Status::Ok, Some(&change.uid), None).await;
    }
    let server = dump(conn, Kind::Note, &change.uid)
        .await?
        .unwrap_or_default();
    let (merged, conflict) = merge_note(base.as_ref().unwrap_or(&server), &server, &data);
    if merged != server {
        apply(conn, Kind::Note, &change.uid, &merged, false).await?;
    }
    let status = if conflict {
        Status::Conflict
    } else {
        Status::Ok
    };
    result(conn, change, status, Some(&change.uid), None).await
}

async fn push(
    State(state): State<AppState>,
    Body(body): Body<PushBody>,
) -> ApiResult<Json<PushResponse>> {
    let mut changes = body.changes;
    changes.sort_by_key(|c| c.kind.index());
    let mut aliases = HashMap::new();
    let mut results = vec![];
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    for change in &changes {
        let outcome = if change.data.is_none() {
            push_deletion(&mut tx, change).await?
        } else {
            match change.kind {
                Kind::Settings => push_settings(&mut tx, change).await?,
                Kind::Note => push_note(&mut tx, change, &aliases).await?,
                _ => push_named(&mut tx, change, &mut aliases).await?,
            }
        };
        results.push(outcome);
    }
    tx.commit().await?;
    Ok(Json(PushResponse { results }))
}

#[derive(Deserialize)]
struct PullQuery {
    #[serde(default)]
    since: i64,
    #[serde(default = "default_limit")]
    limit: i64,
}

fn default_limit() -> i64 {
    200
}

async fn pull(
    State(state): State<AppState>,
    Q(query): Q<PullQuery>,
) -> ApiResult<Json<PullResponse>> {
    check_range("since", query.since, 0, i64::MAX)?;
    check_range("limit", query.limit, 1, MAX_PULL)?;
    let mut tx = state.db.begin().await?;
    let since = query.since;
    let mut notes: Vec<(String, i64)> = sqlx::query_as(
        "SELECT uid, sync_version FROM notes WHERE sync_version > ? ORDER BY sync_version LIMIT ?",
    )
    .bind(since)
    .bind(query.limit + 1)
    .fetch_all(&mut *tx)
    .await?;
    let more = notes.len() as i64 > query.limit;
    notes.truncate(query.limit as usize);
    let version = if more {
        notes.last().map(|n| n.1).unwrap_or(since)
    } else {
        current_version(&mut tx).await?
    };

    let mut changes = vec![];
    let settings_version: Option<i64> =
        sqlx::query_scalar("SELECT sync_version FROM settings WHERE id = 1")
            .fetch_optional(&mut *tx)
            .await?;
    if settings_version.is_some_and(|v| v > since) {
        changes.push(PulledChange {
            kind: Kind::Settings,
            uid: SETTINGS_UID.into(),
            data: dump(&mut tx, Kind::Settings, SETTINGS_UID).await?,
        });
    }
    for kind in [Kind::Project, Kind::Tag] {
        let uids: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT uid FROM {} WHERE sync_version > ?",
            kind.table()
        )))
        .bind(since)
        .fetch_all(&mut *tx)
        .await?;
        for uid in uids {
            let data = dump(&mut tx, kind, &uid).await?;
            changes.push(PulledChange { kind, uid, data });
        }
    }
    for (uid, _) in notes {
        let data = dump(&mut tx, Kind::Note, &uid).await?;
        changes.push(PulledChange {
            kind: Kind::Note,
            uid,
            data,
        });
    }
    let tombstones: Vec<(String, String)> =
        sqlx::query_as("SELECT kind, uid FROM sync_tombstones WHERE version > ?")
            .bind(since)
            .fetch_all(&mut *tx)
            .await?;
    for (kind, uid) in tombstones {
        if let Some(kind) = Kind::parse(&kind) {
            changes.push(PulledChange {
                kind,
                uid,
                data: None,
            });
        }
    }
    tx.commit().await?;
    Ok(Json(PullResponse {
        version,
        more,
        changes,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync/push", post(push))
        .route("/sync/pull", get(pull))
}
