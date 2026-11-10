use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;

use super::{NoteResponse, live_note, note_response};
use crate::db::BEGIN_WRITE;
use crate::error::{ApiError, ApiResult, P};
use crate::state::AppState;
use crate::time::Ts;

const KEEP: i64 = 50;

#[derive(Serialize, sqlx::FromRow)]
struct RevisionSummary {
    id: i64,
    name: String,
    created_at: String,
    characters: i64,
}

#[derive(Serialize, sqlx::FromRow)]
struct Revision {
    id: i64,
    name: String,
    content: String,
    created_at: String,
}

async fn list_revisions(
    State(state): State<AppState>,
    P(note_id): P<i64>,
) -> ApiResult<Json<Vec<RevisionSummary>>> {
    let mut conn = state.db.acquire().await?;
    live_note(&mut conn, note_id).await?;
    let rows = sqlx::query_as(
        "SELECT id, name, created_at, length(content) AS characters FROM note_revisions WHERE note_id = ? ORDER BY id DESC",
    )
    .bind(note_id)
    .fetch_all(&mut *conn)
    .await?;
    Ok(Json(rows))
}

async fn get_revision(
    State(state): State<AppState>,
    P((note_id, revision_id)): P<(i64, i64)>,
) -> ApiResult<Json<Revision>> {
    let mut conn = state.db.acquire().await?;
    live_note(&mut conn, note_id).await?;
    sqlx::query_as(
        "SELECT id, name, content, created_at FROM note_revisions WHERE id = ? AND note_id = ?",
    )
    .bind(revision_id)
    .bind(note_id)
    .fetch_optional(&mut *conn)
    .await?
    .map(Json)
    .ok_or_else(|| ApiError::not_found("Revision not found"))
}

async fn restore_revision(
    State(state): State<AppState>,
    P((note_id, revision_id)): P<(i64, i64)>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let current = live_note(&mut tx, note_id).await?;
    let target: Option<(String, String)> =
        sqlx::query_as("SELECT name, content FROM note_revisions WHERE id = ? AND note_id = ?")
            .bind(revision_id)
            .bind(note_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (name, content) = target.ok_or_else(|| ApiError::not_found("Revision not found"))?;
    if current.name != name || current.content != content {
        sqlx::query(
            "INSERT INTO note_revisions (note_id, name, content, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(note_id)
        .bind(&current.name)
        .bind(&current.content)
        .bind(Ts::now())
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "DELETE FROM note_revisions WHERE note_id = ? AND id NOT IN (SELECT id FROM note_revisions WHERE note_id = ? ORDER BY id DESC LIMIT ?)",
        )
        .bind(note_id)
        .bind(note_id)
        .bind(KEEP)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE notes SET name = ?, content = ?, updated_at = ? WHERE id = ?")
            .bind(&name)
            .bind(&content)
            .bind(Ts::now())
            .bind(note_id)
            .execute(&mut *tx)
            .await?;
    }
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notes/{note_id}/revisions", get(list_revisions))
        .route(
            "/notes/{note_id}/revisions/{revision_id}",
            get(get_revision),
        )
        .route(
            "/notes/{note_id}/revisions/{revision_id}/restore",
            post(restore_revision),
        )
}
