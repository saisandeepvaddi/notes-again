use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::AssertSqlSafe;

use super::bulk::{
    MAX_BULK_IDS, ResumeResult, Scope, add_to_review, pause_notes, remove_from_review,
    resume_notes, trash_notes,
};
use super::{CHUNK, difficulty_tag, hard_delete_notes, live_project};
use crate::db::models::{TAG_COLUMNS, TagRow};
use crate::db::{BEGIN_WRITE, Conn};
use crate::difficulty::Difficulty;
use crate::error::{ApiError, ApiResult, Body};
use crate::params::{check_range, dedupe, id_list};
use crate::state::AppState;
use crate::time::Ts;

#[derive(Serialize)]
struct BulkResult {
    affected: i64,
}

#[derive(Deserialize)]
struct BulkBody {
    note_ids: Vec<i64>,
}

fn ids(note_ids: &[i64]) -> ApiResult<Vec<i64>> {
    if note_ids.len() > MAX_BULK_IDS {
        return Err(ApiError::bad_request(format!(
            "Too many notes at once (max {}).",
            "10,000"
        )));
    }
    Ok(dedupe(note_ids))
}

async fn live_ids(conn: &mut Conn, chunk: &[i64]) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar(AssertSqlSafe(format!(
        "SELECT id FROM notes WHERE id IN ({}) AND deleted_at IS NULL",
        id_list(chunk)
    )))
    .fetch_all(conn)
    .await
}

async fn bulk_trash(
    State(state): State<AppState>,
    Body(body): Body<BulkBody>,
) -> ApiResult<Json<BulkResult>> {
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let affected = trash_notes(&mut tx, &Scope::Ids(ids)).await?;
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

async fn bulk_restore(
    State(state): State<AppState>,
    Body(body): Body<BulkBody>,
) -> ApiResult<Json<BulkResult>> {
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let mut affected = 0;
    for chunk in ids.chunks(CHUNK) {
        affected += sqlx::query(AssertSqlSafe(format!(
            "UPDATE notes SET deleted_at = NULL WHERE id IN ({}) AND deleted_at IS NOT NULL",
            id_list(chunk)
        )))
        .execute(&mut *tx)
        .await?
        .rows_affected() as i64;
    }
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

async fn bulk_permanently_delete(
    State(state): State<AppState>,
    Body(body): Body<BulkBody>,
) -> ApiResult<Json<BulkResult>> {
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let mut affected = 0;
    for chunk in ids.chunks(CHUNK) {
        let trashed: Vec<i64> = sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT id FROM notes WHERE id IN ({}) AND deleted_at IS NOT NULL",
            id_list(chunk)
        )))
        .fetch_all(&mut *tx)
        .await?;
        hard_delete_notes(&mut tx, &trashed).await?;
        affected += trashed.len() as i64;
    }
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

async fn bulk_pause(
    State(state): State<AppState>,
    Body(body): Body<BulkBody>,
) -> ApiResult<Json<BulkResult>> {
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let affected = pause_notes(&mut tx, &Scope::Ids(ids)).await?;
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

#[derive(Deserialize)]
struct BulkResumeBody {
    note_ids: Vec<i64>,
    #[serde(default = "default_per_day")]
    per_day: i64,
    #[serde(default)]
    tz_offset_minutes: i64,
    #[serde(default)]
    paused: bool,
}

fn default_per_day() -> i64 {
    10
}

impl BulkResumeBody {
    fn validate(&self) -> ApiResult<()> {
        check_range("per_day", self.per_day, 0, super::pacing::MAX_PER_DAY)?;
        check_range(
            "tz_offset_minutes",
            self.tz_offset_minutes,
            -24 * 60,
            24 * 60,
        )
    }
}

async fn bulk_resume(
    State(state): State<AppState>,
    Body(body): Body<BulkResumeBody>,
) -> ApiResult<Json<ResumeResult>> {
    body.validate()?;
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let result = resume_notes(
        &mut tx,
        &Scope::Ids(ids),
        body.per_day,
        body.tz_offset_minutes,
    )
    .await?;
    tx.commit().await?;
    Ok(Json(result))
}

async fn bulk_remove_from_review(
    State(state): State<AppState>,
    Body(body): Body<BulkBody>,
) -> ApiResult<Json<BulkResult>> {
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let affected = remove_from_review(&mut tx, &Scope::Ids(ids)).await?;
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

async fn bulk_add_to_review(
    State(state): State<AppState>,
    Body(body): Body<BulkResumeBody>,
) -> ApiResult<Json<ResumeResult>> {
    body.validate()?;
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let result = add_to_review(
        &mut tx,
        &Scope::Ids(ids),
        body.paused,
        body.per_day,
        body.tz_offset_minutes,
    )
    .await?;
    tx.commit().await?;
    Ok(Json(result))
}

#[derive(Deserialize)]
struct BulkProjectBody {
    note_ids: Vec<i64>,
    #[serde(default)]
    project_id: Option<i64>,
}

async fn bulk_set_project(
    State(state): State<AppState>,
    Body(body): Body<BulkProjectBody>,
) -> ApiResult<Json<BulkResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    if let Some(project_id) = body.project_id {
        live_project(&mut tx, project_id).await?;
    }
    let ids = ids(&body.note_ids)?;
    let mut affected = 0;
    for chunk in ids.chunks(CHUNK) {
        affected += sqlx::query(AssertSqlSafe(format!(
            "UPDATE notes SET project_id = ? WHERE id IN ({}) AND deleted_at IS NULL",
            id_list(chunk)
        )))
        .bind(body.project_id)
        .execute(&mut *tx)
        .await?
        .rows_affected() as i64;
    }
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

#[derive(Deserialize)]
struct BulkTagsBody {
    note_ids: Vec<i64>,
    #[serde(default)]
    add_tag_ids: Vec<i64>,
    #[serde(default)]
    remove_tag_ids: Vec<i64>,
}

async fn bulk_edit_tags(
    State(state): State<AppState>,
    Body(body): Body<BulkTagsBody>,
) -> ApiResult<Json<BulkResult>> {
    let mut wanted = body.add_tag_ids.clone();
    wanted.extend(&body.remove_tag_ids);
    let wanted = dedupe(&wanted);
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let tags: Vec<TagRow> = if wanted.is_empty() {
        vec![]
    } else {
        sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {TAG_COLUMNS} FROM tags WHERE id IN ({})",
            id_list(&wanted)
        )))
        .fetch_all(&mut *tx)
        .await?
    };
    if tags.len() != wanted.len() {
        return Err(ApiError::not_found("Tag not found"));
    }
    if tags.iter().any(|t| t.is_difficulty) {
        return Err(ApiError::bad_request(
            "Use the difficulty action to change difficulty",
        ));
    }
    let ids = ids(&body.note_ids)?;
    let add = dedupe(&body.add_tag_ids);
    let mut affected = 0;
    for chunk in ids.chunks(CHUNK) {
        let live = live_ids(&mut tx, chunk).await?;
        affected += live.len() as i64;
        if live.is_empty() {
            continue;
        }
        if !body.remove_tag_ids.is_empty() {
            sqlx::query(AssertSqlSafe(format!(
                "DELETE FROM note_tags WHERE note_id IN ({}) AND tag_id IN ({})",
                id_list(&live),
                id_list(&body.remove_tag_ids)
            )))
            .execute(&mut *tx)
            .await?;
        }
        for note_id in &live {
            for tag_id in &add {
                sqlx::query("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)")
                    .bind(note_id)
                    .bind(tag_id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

#[derive(Deserialize)]
struct BulkDifficultyBody {
    note_ids: Vec<i64>,
    difficulty: Difficulty,
}

async fn bulk_set_difficulty(
    State(state): State<AppState>,
    Body(body): Body<BulkDifficultyBody>,
) -> ApiResult<Json<BulkResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let tag = difficulty_tag(&mut tx, body.difficulty).await?;
    let ids = ids(&body.note_ids)?;
    let mut affected = 0;
    for chunk in ids.chunks(CHUNK) {
        let live = live_ids(&mut tx, chunk).await?;
        affected += live.len() as i64;
        if live.is_empty() {
            continue;
        }
        let list = id_list(&live);
        sqlx::query(AssertSqlSafe(format!(
            "DELETE FROM note_tags WHERE note_id IN ({list}) AND tag_id IN (SELECT id FROM tags WHERE is_difficulty = 1)"
        )))
        .execute(&mut *tx)
        .await?;
        sqlx::query(AssertSqlSafe(format!(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) SELECT id, ? FROM notes WHERE id IN ({list})"
        )))
        .bind(tag.id)
        .execute(&mut *tx)
        .await?;
        if let Some(ease) = tag.default_ease_factor {
            sqlx::query(AssertSqlSafe(format!(
                "UPDATE notes SET ease_factor = ? WHERE id IN ({list})"
            )))
            .bind(ease)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

#[derive(Deserialize)]
struct BulkRescheduleBody {
    note_ids: Vec<i64>,
    remind_at: Ts,
}

async fn bulk_reschedule(
    State(state): State<AppState>,
    Body(body): Body<BulkRescheduleBody>,
) -> ApiResult<Json<BulkResult>> {
    let ids = ids(&body.note_ids)?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let mut affected = 0;
    for chunk in ids.chunks(CHUNK) {
        let live = live_ids(&mut tx, chunk).await?;
        if live.is_empty() {
            continue;
        }
        affected += sqlx::query(AssertSqlSafe(format!(
            "UPDATE reminders SET remind_at = ? WHERE note_id IN ({}) AND deleted_at IS NULL AND reviewed_at IS NULL",
            id_list(&live)
        )))
        .bind(body.remind_at)
        .execute(&mut *tx)
        .await?
        .rows_affected() as i64;
    }
    tx.commit().await?;
    Ok(Json(BulkResult { affected }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notes/bulk/delete", post(bulk_trash))
        .route("/notes/bulk/restore", post(bulk_restore))
        .route("/notes/bulk/permanent", post(bulk_permanently_delete))
        .route("/notes/bulk/pause", post(bulk_pause))
        .route("/notes/bulk/resume", post(bulk_resume))
        .route(
            "/notes/bulk/remove-from-review",
            post(bulk_remove_from_review),
        )
        .route("/notes/bulk/add-to-review", post(bulk_add_to_review))
        .route("/notes/bulk/project", post(bulk_set_project))
        .route("/notes/bulk/tags", post(bulk_edit_tags))
        .route("/notes/bulk/difficulty", post(bulk_set_difficulty))
        .route("/notes/bulk/reschedule", post(bulk_reschedule))
}
