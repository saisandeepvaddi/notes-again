use std::sync::LazyLock;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::error::{ApiError, ApiResult, P, Q};
use crate::notes::live_note;
use crate::search::{match_expression, plain_text};
use crate::state::AppState;
use crate::text::{markdown_title_text, take_chars};

const MAX_BACKLINKS: i64 = 100;
const MAX_TARGETS: usize = 50;

static UID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-f0-9]{32}$").unwrap());

pub fn link_target(uid: &str) -> String {
    format!("](note:{uid})")
}

#[derive(Serialize)]
struct Backlink {
    id: i64,
    title: String,
    snippet: String,
}

async fn backlinks(
    State(state): State<AppState>,
    P(note_id): P<i64>,
) -> ApiResult<Json<Vec<Backlink>>> {
    let mut conn = state.db.acquire().await?;
    let note = live_note(&mut conn, note_id).await?;
    let target = link_target(&note.uid);
    let rows: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT id, name, content FROM notes WHERE deleted_at IS NULL AND id != ? \
         AND id IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?) \
         ORDER BY updated_at DESC LIMIT ?",
    )
    .bind(note_id)
    .bind(match_expression(&[format!("note:{}", note.uid)]))
    .bind(MAX_BACKLINKS)
    .fetch_all(&mut *conn)
    .await?;
    Ok(Json(
        rows.into_iter()
            .filter_map(|(id, name, content)| {
                let line = content.lines().find(|line| line.contains(&target))?;
                Some(Backlink {
                    id,
                    title: markdown_title_text(&name),
                    snippet: take_chars(&plain_text(line), 160).to_string(),
                })
            })
            .collect(),
    ))
}

#[derive(Deserialize)]
struct TargetsQuery {
    uids: String,
}

#[derive(Serialize, sqlx::FromRow)]
struct Target {
    uid: String,
    id: i64,
    name: String,
    trashed: bool,
}

async fn targets(
    State(state): State<AppState>,
    Q(query): Q<TargetsQuery>,
) -> ApiResult<Json<Vec<Target>>> {
    let uids: Vec<&str> = query
        .uids
        .split(',')
        .filter(|uid| !uid.is_empty())
        .collect();
    if uids.len() > MAX_TARGETS || uids.iter().any(|uid| !UID.is_match(uid)) {
        return Err(ApiError::bad_request("Invalid note link"));
    }
    if uids.is_empty() {
        return Ok(Json(vec![]));
    }
    let marks = vec!["?"; uids.len()].join(",");
    let sql = format!(
        "SELECT uid, id, name, deleted_at IS NOT NULL AS trashed FROM notes WHERE uid IN ({marks})"
    );
    let mut q = sqlx::query_as::<_, Target>(sqlx::AssertSqlSafe(sql));
    for uid in uids {
        q = q.bind(uid);
    }
    let mut rows = q.fetch_all(&state.db).await?;
    for row in &mut rows {
        row.name = markdown_title_text(&row.name);
    }
    Ok(Json(rows))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notes/{note_id}/backlinks", get(backlinks))
        .route("/notes/link-targets", get(targets))
}
