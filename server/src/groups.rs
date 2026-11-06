use std::collections::HashMap;

use axum::extract::State;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::AssertSqlSafe;

use crate::db::models::{
    PROJECT_COLUMNS, ProjectResponse, ProjectRow, TAG_COLUMNS, TagResponse, TagRow, new_uid,
};
use crate::db::{BEGIN_WRITE, Conn};
use crate::error::{ApiError, ApiResult, Body, P, Q};
use crate::notes::bulk::{
    GroupDeleteResult, ResumeOptions, ResumeResult, Scope, add_to_review, delete_unused_tags,
    pause_notes, remove_from_review, resume_notes, trash_notes,
};
use crate::params::lenient_bool;
use crate::state::AppState;
use crate::time::Ts;

#[derive(Serialize)]
struct TagListItem {
    id: i64,
    name: String,
    is_difficulty: bool,
    note_count: i64,
    paused_count: i64,
    note_only_count: i64,
}

#[derive(Serialize)]
struct ProjectListItem {
    id: i64,
    name: String,
    paused: bool,
    note_count: i64,
    paused_count: i64,
    note_only_count: i64,
}

#[derive(Serialize)]
struct PauseResult {
    affected: i64,
}

#[derive(Deserialize)]
struct NameBody {
    name: String,
}

#[derive(Deserialize)]
struct DeleteQuery {
    #[serde(default, deserialize_with = "lenient_bool")]
    delete_notes: bool,
    #[serde(default, deserialize_with = "lenient_bool")]
    delete_orphan_tags: bool,
}

#[derive(Serialize)]
struct UnusedTagsResult {
    tags_deleted: i64,
}

async fn counts(conn: &mut Conn, sql: &str) -> Result<HashMap<i64, (i64, i64, i64)>, sqlx::Error> {
    let rows: Vec<(i64, i64, i64, i64)> = sqlx::query_as(AssertSqlSafe(sql.to_string()))
        .fetch_all(conn)
        .await?;
    Ok(rows
        .into_iter()
        .map(|(id, total, paused, note_only)| (id, (total, paused, note_only)))
        .collect())
}

async fn get_tags(State(state): State<AppState>) -> ApiResult<Json<Vec<TagListItem>>> {
    let mut conn = state.db.acquire().await?;
    let tags: Vec<TagRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {TAG_COLUMNS} FROM tags ORDER BY lower(tags.name)"
    )))
    .fetch_all(&mut *conn)
    .await?;
    let counts = counts(
        &mut conn,
        "SELECT note_tags.tag_id, count(*), count(notes.paused_at), count(CASE WHEN notes.in_review = 0 THEN 1 END) \
         FROM note_tags JOIN notes ON notes.id = note_tags.note_id WHERE notes.deleted_at IS NULL GROUP BY note_tags.tag_id",
    )
    .await?;
    Ok(Json(
        tags.into_iter()
            .map(|t| {
                let (total, paused, note_only) = counts.get(&t.id).copied().unwrap_or_default();
                TagListItem {
                    id: t.id,
                    name: t.name,
                    is_difficulty: t.is_difficulty,
                    note_count: total,
                    paused_count: paused,
                    note_only_count: note_only,
                }
            })
            .collect(),
    ))
}

pub async fn find_or_create_tag(conn: &mut Conn, name: &str) -> Result<TagRow, sqlx::Error> {
    let existing: Option<TagRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {TAG_COLUMNS} FROM tags WHERE lower(tags.name) = lower(?)"
    )))
    .bind(name)
    .fetch_optional(&mut *conn)
    .await?;
    if let Some(tag) = existing {
        return Ok(tag);
    }
    let id = sqlx::query(
        "INSERT INTO tags (uid, sync_version, name, created_at, is_difficulty, default_ease_factor) VALUES (?, 0, ?, ?, 0, NULL)",
    )
    .bind(new_uid())
    .bind(name)
    .bind(Ts::now())
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {TAG_COLUMNS} FROM tags WHERE id = ?"
    )))
    .bind(id)
    .fetch_one(conn)
    .await
}

async fn create_tag(
    State(state): State<AppState>,
    Body(body): Body<NameBody>,
) -> ApiResult<Json<TagResponse>> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("Tag name cannot be empty"));
    }
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let tag = find_or_create_tag(&mut tx, name).await?;
    tx.commit().await?;
    Ok(Json(TagResponse::from(&tag)))
}

async fn delete_all_unused_tags(
    State(state): State<AppState>,
) -> ApiResult<Json<UnusedTagsResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let deleted = delete_unused_tags(&mut tx, None).await?;
    tx.commit().await?;
    Ok(Json(UnusedTagsResult {
        tags_deleted: deleted,
    }))
}

async fn tag_scope(conn: &mut Conn, tag_id: i64) -> ApiResult<Scope> {
    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM tags WHERE id = ?")
        .bind(tag_id)
        .fetch_optional(conn)
        .await?;
    exists
        .map(Scope::Tag)
        .ok_or_else(|| ApiError::not_found("Tag not found"))
}

async fn pause_tag(
    State(state): State<AppState>,
    P(tag_id): P<i64>,
) -> ApiResult<Json<PauseResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let scope = tag_scope(&mut tx, tag_id).await?;
    let affected = pause_notes(&mut tx, &scope).await?;
    tx.commit().await?;
    Ok(Json(PauseResult { affected }))
}

async fn resume_tag(
    State(state): State<AppState>,
    P(tag_id): P<i64>,
    Body(body): Body<ResumeOptions>,
) -> ApiResult<Json<ResumeResult>> {
    body.validate()?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let scope = tag_scope(&mut tx, tag_id).await?;
    let result = resume_notes(&mut tx, &scope, body.per_day, body.tz_offset_minutes).await?;
    tx.commit().await?;
    Ok(Json(result))
}

async fn remove_tag_from_review(
    State(state): State<AppState>,
    P(tag_id): P<i64>,
) -> ApiResult<Json<PauseResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let scope = tag_scope(&mut tx, tag_id).await?;
    let affected = remove_from_review(&mut tx, &scope).await?;
    tx.commit().await?;
    Ok(Json(PauseResult { affected }))
}

async fn add_tag_to_review(
    State(state): State<AppState>,
    P(tag_id): P<i64>,
    Body(body): Body<ResumeOptions>,
) -> ApiResult<Json<ResumeResult>> {
    body.validate()?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let scope = tag_scope(&mut tx, tag_id).await?;
    let result =
        add_to_review(&mut tx, &scope, false, body.per_day, body.tz_offset_minutes).await?;
    tx.commit().await?;
    Ok(Json(result))
}

async fn live_count(conn: &mut Conn, condition: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(AssertSqlSafe(format!(
        "SELECT count(*) FROM notes WHERE {condition} AND notes.deleted_at IS NULL"
    )))
    .fetch_one(conn)
    .await
}

async fn delete_tag(
    State(state): State<AppState>,
    P(tag_id): P<i64>,
    Q(query): Q<DeleteQuery>,
) -> ApiResult<Json<GroupDeleteResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let tag: Option<TagRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {TAG_COLUMNS} FROM tags WHERE id = ?"
    )))
    .bind(tag_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(tag) = tag else {
        return Err(ApiError::not_found("Tag not found"));
    };
    if tag.is_difficulty {
        return Err(ApiError::bad_request("Difficulty tags can't be deleted"));
    }
    let tagged = format!("notes.id IN (SELECT note_id FROM note_tags WHERE tag_id = {tag_id})");
    let live = live_count(&mut tx, &tagged).await?;
    let trashed = if query.delete_notes {
        trash_notes(&mut tx, &Scope::Tag(tag_id)).await?
    } else {
        0
    };
    sqlx::query("DELETE FROM note_tags WHERE tag_id = ?")
        .bind(tag_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(tag_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(GroupDeleteResult {
        notes_trashed: trashed,
        notes_kept: live - trashed,
        tags_deleted: 0,
    }))
}

async fn get_projects(State(state): State<AppState>) -> ApiResult<Json<Vec<ProjectListItem>>> {
    let mut conn = state.db.acquire().await?;
    let projects: Vec<ProjectRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE deleted_at IS NULL ORDER BY lower(projects.name)"
    )))
    .fetch_all(&mut *conn)
    .await?;
    let counts = counts(
        &mut conn,
        "SELECT project_id, count(*), count(paused_at), count(CASE WHEN in_review = 0 THEN 1 END) FROM notes \
         WHERE deleted_at IS NULL AND project_id IS NOT NULL GROUP BY project_id",
    )
    .await?;
    Ok(Json(
        projects
            .into_iter()
            .map(|p| {
                let (total, paused, note_only) = counts.get(&p.id).copied().unwrap_or_default();
                ProjectListItem {
                    id: p.id,
                    name: p.name,
                    paused: p.paused,
                    note_count: total,
                    paused_count: paused,
                    note_only_count: note_only,
                }
            })
            .collect(),
    ))
}

pub async fn insert_project(
    conn: &mut Conn,
    name: &str,
    paused: bool,
) -> Result<ProjectRow, sqlx::Error> {
    let id = sqlx::query(
        "INSERT INTO projects (uid, sync_version, name, created_at, deleted_at, paused) VALUES (?, 0, ?, ?, NULL, ?)",
    )
    .bind(new_uid())
    .bind(name)
    .bind(Ts::now())
    .bind(paused)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?"
    )))
    .bind(id)
    .fetch_one(conn)
    .await
}

async fn create_project(
    State(state): State<AppState>,
    Body(body): Body<NameBody>,
) -> ApiResult<Json<ProjectResponse>> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("Project name cannot be empty"));
    }
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let existing: Option<ProjectRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE lower(projects.name) = lower(?) AND deleted_at IS NULL"
    )))
    .bind(name)
    .fetch_optional(&mut *tx)
    .await?;
    let project = match existing {
        Some(project) => project,
        None => insert_project(&mut tx, name, false).await?,
    };
    tx.commit().await?;
    Ok(Json(ProjectResponse::from(&project)))
}

async fn set_project_paused(conn: &mut Conn, project_id: i64, paused: bool) -> ApiResult<()> {
    crate::notes::live_project(conn, project_id).await?;
    sqlx::query("UPDATE projects SET paused = ? WHERE id = ?")
        .bind(paused)
        .bind(project_id)
        .execute(conn)
        .await?;
    Ok(())
}

async fn pause_project(
    State(state): State<AppState>,
    P(project_id): P<i64>,
) -> ApiResult<Json<PauseResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    set_project_paused(&mut tx, project_id, true).await?;
    let affected = pause_notes(&mut tx, &Scope::Project(project_id)).await?;
    tx.commit().await?;
    Ok(Json(PauseResult { affected }))
}

async fn resume_project(
    State(state): State<AppState>,
    P(project_id): P<i64>,
    Body(body): Body<ResumeOptions>,
) -> ApiResult<Json<ResumeResult>> {
    body.validate()?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    set_project_paused(&mut tx, project_id, false).await?;
    let result = resume_notes(
        &mut tx,
        &Scope::Project(project_id),
        body.per_day,
        body.tz_offset_minutes,
    )
    .await?;
    tx.commit().await?;
    Ok(Json(result))
}

async fn remove_project_from_review(
    State(state): State<AppState>,
    P(project_id): P<i64>,
) -> ApiResult<Json<PauseResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    crate::notes::live_project(&mut tx, project_id).await?;
    let affected = remove_from_review(&mut tx, &Scope::Project(project_id)).await?;
    tx.commit().await?;
    Ok(Json(PauseResult { affected }))
}

async fn add_project_to_review(
    State(state): State<AppState>,
    P(project_id): P<i64>,
    Body(body): Body<ResumeOptions>,
) -> ApiResult<Json<ResumeResult>> {
    body.validate()?;
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    crate::notes::live_project(&mut tx, project_id).await?;
    let result = add_to_review(
        &mut tx,
        &Scope::Project(project_id),
        false,
        body.per_day,
        body.tz_offset_minutes,
    )
    .await?;
    tx.commit().await?;
    Ok(Json(result))
}

async fn delete_project(
    State(state): State<AppState>,
    P(project_id): P<i64>,
    Q(query): Q<DeleteQuery>,
) -> ApiResult<Json<GroupDeleteResult>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(ApiError::not_found("Project not found"));
    }
    let in_project = format!("notes.project_id = {project_id}");
    let live = live_count(&mut tx, &in_project).await?;
    let trashed = if query.delete_notes {
        trash_notes(&mut tx, &Scope::Project(project_id)).await?
    } else {
        0
    };
    let mut tags_deleted = 0;
    if query.delete_notes && query.delete_orphan_tags {
        let among = format!(
            "SELECT note_tags.tag_id FROM note_tags JOIN notes ON notes.id = note_tags.note_id WHERE {in_project}"
        );
        tags_deleted = delete_unused_tags(&mut tx, Some(&among)).await?;
    }
    sqlx::query("UPDATE notes SET project_id = NULL WHERE project_id = ?")
        .bind(project_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(project_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(GroupDeleteResult {
        notes_trashed: trashed,
        notes_kept: live - trashed,
        tags_deleted,
    }))
}

#[derive(Serialize)]
struct SettingsResponse {
    default_algorithm: String,
}

#[derive(Deserialize)]
struct UpdateSettingsBody {
    default_algorithm: crate::scheduling::Algorithm,
}

async fn ensure_settings(conn: &mut Conn) -> Result<String, sqlx::Error> {
    let current: Option<String> =
        sqlx::query_scalar("SELECT default_algorithm FROM settings WHERE id = 1")
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(value) = current {
        return Ok(value);
    }
    sqlx::query("INSERT INTO settings (id, sync_version, default_algorithm) VALUES (1, 0, 'fsrs')")
        .execute(conn)
        .await?;
    Ok("fsrs".into())
}

async fn read_settings(State(state): State<AppState>) -> ApiResult<Json<SettingsResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let default_algorithm = ensure_settings(&mut tx).await?;
    tx.commit().await?;
    Ok(Json(SettingsResponse { default_algorithm }))
}

async fn update_settings(
    State(state): State<AppState>,
    Body(body): Body<UpdateSettingsBody>,
) -> ApiResult<Json<SettingsResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    ensure_settings(&mut tx).await?;
    sqlx::query("UPDATE settings SET default_algorithm = ? WHERE id = 1")
        .bind(body.default_algorithm.as_str())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(SettingsResponse {
        default_algorithm: body.default_algorithm.as_str().into(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tags/list", get(get_tags))
        .route("/tags/create", post(create_tag))
        .route("/tags/unused", delete(delete_all_unused_tags))
        .route("/tags/{tag_id}/pause", post(pause_tag))
        .route("/tags/{tag_id}/resume", post(resume_tag))
        .route(
            "/tags/{tag_id}/remove-from-review",
            post(remove_tag_from_review),
        )
        .route("/tags/{tag_id}/add-to-review", post(add_tag_to_review))
        .route("/tags/{tag_id}", delete(delete_tag))
        .route("/projects/list", get(get_projects))
        .route("/projects/create", post(create_project))
        .route("/projects/{project_id}/pause", post(pause_project))
        .route("/projects/{project_id}/resume", post(resume_project))
        .route(
            "/projects/{project_id}/remove-from-review",
            post(remove_project_from_review),
        )
        .route(
            "/projects/{project_id}/add-to-review",
            post(add_project_to_review),
        )
        .route("/projects/{project_id}", delete(delete_project))
        .route("/settings", get(read_settings).patch(update_settings))
}
