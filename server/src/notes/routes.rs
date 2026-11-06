use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::AssertSqlSafe;

use super::bulk::{MAX_BULK_IDS, Scope, add_to_review, remove_from_review};
use super::{
    NewNote, NoteResponse, ReviewStatus, default_algorithm, difficulty_tag, get_note_row,
    hard_delete_notes, insert_note, insert_reminder, live_note, live_project, load_full,
    load_responses, note_response, scheduling_of,
};
use crate::db::models::{REMINDER_COLUMNS, ReminderRow, TAG_COLUMNS, TagRow};
use crate::db::{BEGIN_WRITE, Conn};
use crate::difficulty::{DIFFICULTY_TAGS, Difficulty};
use crate::error::{ApiError, ApiResult, Body, P, Q};
use crate::params::{check_range, id_list, lenient_bool, lenient_opt_bool};
use crate::scheduling::{Rating, Snapshot};
use crate::search::note_search_condition;
use crate::sql::{Value, Where, bind_scalar};
use crate::state::AppState;
use crate::time::Ts;

const MAX_PAGE_SIZE: i64 = 200;

#[derive(Serialize)]
pub struct NotePage {
    items: Vec<NoteResponse>,
    total: i64,
}

#[derive(Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
enum NoteSort {
    #[default]
    Due,
    Name,
    Project,
    Created,
    Difficulty,
}

#[derive(Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
enum Order {
    #[default]
    Asc,
    Desc,
}

fn sort_key(sort: NoteSort) -> String {
    match sort {
        NoteSort::Name => "lower(notes.name)".into(),
        NoteSort::Project => {
            "(SELECT lower(projects.name) FROM projects WHERE projects.id = notes.project_id)"
                .into()
        }
        NoteSort::Created => "notes.created_at".into(),
        NoteSort::Difficulty => {
            let cases: String = DIFFICULTY_TAGS
                .iter()
                .enumerate()
                .map(|(i, t)| format!(" WHEN '{}' THEN {i}", t.name))
                .collect();
            format!(
                "(SELECT min(CASE tags.name{cases} END) FROM tags JOIN note_tags ON note_tags.tag_id = tags.id \
                 WHERE note_tags.note_id = notes.id AND tags.is_difficulty = 1)"
            )
        }
        NoteSort::Due => {
            "(SELECT min(reminders.remind_at) FROM reminders WHERE reminders.note_id = notes.id \
             AND reminders.reviewed_at IS NULL AND reminders.deleted_at IS NULL)"
                .into()
        }
    }
}

fn order_by(sort: NoteSort, order: Order) -> String {
    let direction = match order {
        Order::Asc => "ASC",
        Order::Desc => "DESC",
    };
    format!("{} {direction} NULLS LAST, notes.id ASC", sort_key(sort))
}

#[derive(Deserialize, Default)]
struct ListQuery {
    #[serde(default)]
    start: Option<Ts>,
    #[serde(default)]
    end: Option<Ts>,
    #[serde(default)]
    tag_id: Option<i64>,
    #[serde(default)]
    project_id: Option<i64>,
    #[serde(default, deserialize_with = "lenient_bool")]
    deleted: bool,
    #[serde(default)]
    search: Option<String>,
    #[serde(default, deserialize_with = "lenient_opt_bool")]
    paused: Option<bool>,
    #[serde(default)]
    status: Option<ReviewStatus>,
    #[serde(default)]
    sort: NoteSort,
    #[serde(default)]
    order: Order,
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
}

fn list_conditions(query: &ListQuery) -> Where {
    let mut w = Where::default();
    w.push(if query.deleted {
        "notes.deleted_at IS NOT NULL"
    } else {
        "notes.deleted_at IS NULL"
    });
    match query.status {
        Some(ReviewStatus::Active) => w.push("notes.in_review = 1 AND notes.paused_at IS NULL"),
        Some(ReviewStatus::Paused) => w.push("notes.paused_at IS NOT NULL"),
        Some(ReviewStatus::NoteOnly) => w.push("notes.in_review = 0"),
        None => {}
    }
    match query.paused {
        Some(true) => w.push("notes.paused_at IS NOT NULL"),
        Some(false) => w.push("notes.paused_at IS NULL"),
        None => {}
    }
    if let Some(search) = query.search.as_deref().filter(|s| !s.is_empty())
        && let Some(condition) = note_search_condition(search)
    {
        w.push_with(condition.sql(), condition.binds);
    }
    if let (Some(start), Some(end)) = (query.start, query.end) {
        w.push("notes.in_review = 1 AND notes.paused_at IS NULL");
        let now = Ts::now();
        let exists = "EXISTS (SELECT reminders.id FROM reminders WHERE reminders.note_id = notes.id \
                      AND reminders.deleted_at IS NULL AND ";
        if start <= now && now < end {
            w.push_with(
                format!(
                    "{exists}((reminders.remind_at >= ? AND reminders.remind_at < ?) \
                     OR (reminders.remind_at < ? AND reminders.reviewed_at IS NULL)))"
                ),
                [Value::Time(start), Value::Time(end), Value::Time(start)],
            );
        } else {
            w.push_with(
                format!("{exists}reminders.remind_at >= ? AND reminders.remind_at < ?)"),
                [Value::Time(start), Value::Time(end)],
            );
        }
    }
    if let Some(tag_id) = query.tag_id {
        w.push(format!("notes.id IN (SELECT note_tags.note_id FROM note_tags WHERE note_tags.tag_id = {tag_id})"));
    }
    if let Some(project_id) = query.project_id {
        w.push(format!("notes.project_id = {project_id}"));
    }
    w
}

async fn count(conn: &mut Conn, w: &Where) -> Result<i64, sqlx::Error> {
    bind_scalar(
        sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT count(*) FROM notes WHERE {}",
            w.sql()
        ))),
        &w.binds,
    )
    .fetch_one(conn)
    .await
}

async fn page(
    conn: &mut Conn,
    w: &Where,
    sort: NoteSort,
    order: Order,
    limit: i64,
    offset: i64,
) -> ApiResult<NotePage> {
    let total = count(conn, w).await?;
    let sql = format!(
        "SELECT notes.id FROM notes WHERE {} ORDER BY {} LIMIT {limit} OFFSET {offset}",
        w.sql(),
        order_by(sort, order)
    );
    let ids: Vec<i64> = bind_scalar(sqlx::query_scalar(AssertSqlSafe(sql)), &w.binds)
        .fetch_all(&mut *conn)
        .await?;
    Ok(NotePage {
        items: load_responses(conn, &ids).await?,
        total,
    })
}

fn page_bounds(limit: Option<i64>, offset: Option<i64>) -> ApiResult<(i64, i64)> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    check_range("limit", limit, 1, MAX_PAGE_SIZE)?;
    check_range("offset", offset, 0, i64::MAX)?;
    Ok((limit, offset))
}

async fn get_notes(
    State(state): State<AppState>,
    Q(query): Q<ListQuery>,
) -> ApiResult<Json<NotePage>> {
    let (limit, offset) = page_bounds(query.limit, query.offset)?;
    let mut conn = state.db.acquire().await?;
    let w = list_conditions(&query);
    Ok(Json(
        page(&mut conn, &w, query.sort, query.order, limit, offset).await?,
    ))
}

#[derive(Serialize)]
struct NoteIds {
    ids: Vec<i64>,
    total: i64,
}

async fn get_note_ids(
    State(state): State<AppState>,
    Q(query): Q<ListQuery>,
) -> ApiResult<Json<NoteIds>> {
    let mut conn = state.db.acquire().await?;
    let w = list_conditions(&query);
    let total = count(&mut conn, &w).await?;
    let sql = format!(
        "SELECT notes.id FROM notes WHERE {} ORDER BY {} LIMIT {MAX_BULK_IDS}",
        w.sql(),
        order_by(query.sort, query.order)
    );
    let ids: Vec<i64> = bind_scalar(sqlx::query_scalar(AssertSqlSafe(sql)), &w.binds)
        .fetch_all(&mut *conn)
        .await?;
    Ok(Json(NoteIds { ids, total }))
}

#[derive(Deserialize)]
struct PageQuery {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    offset: Option<i64>,
}

async fn get_due_notes(
    State(state): State<AppState>,
    Q(query): Q<PageQuery>,
) -> ApiResult<Json<NotePage>> {
    let (limit, offset) = page_bounds(query.limit, query.offset)?;
    let mut conn = state.db.acquire().await?;
    let mut w = Where::default();
    w.push("notes.deleted_at IS NULL AND notes.in_review = 1 AND notes.paused_at IS NULL");
    w.push_with(
        "EXISTS (SELECT reminders.id FROM reminders WHERE reminders.note_id = notes.id AND reminders.deleted_at IS NULL \
         AND reminders.reviewed_at IS NULL AND reminders.remind_at <= ?)",
        [Value::Time(Ts::now())],
    );
    Ok(Json(
        page(&mut conn, &w, NoteSort::Due, Order::Asc, limit, offset).await?,
    ))
}

async fn get_note(
    State(state): State<AppState>,
    P(note_id): P<i64>,
) -> ApiResult<Json<NoteResponse>> {
    let mut conn = state.db.acquire().await?;
    live_note(&mut conn, note_id).await?;
    Ok(Json(note_response(&mut conn, note_id).await?))
}

#[derive(Deserialize)]
struct MarkdownQuery {
    #[serde(default, deserialize_with = "lenient_bool")]
    download: bool,
}

async fn get_note_markdown(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Q(query): Q<MarkdownQuery>,
) -> ApiResult<Response> {
    let mut conn = state.db.acquire().await?;
    live_note(&mut conn, note_id).await?;
    let full = load_full(&mut conn, &[note_id])
        .await?
        .pop()
        .ok_or_else(|| ApiError::not_found("Note not found"))?;
    let body = super::markdown::note_markdown(&full);
    let mut response = (
        StatusCode::OK,
        [(CONTENT_TYPE, "text/markdown; charset=utf-8".to_string())],
        body,
    )
        .into_response();
    if query.download {
        let filename = super::markdown::note_filename(&full.note);
        let ascii: String = filename.chars().filter(char::is_ascii).collect();
        let fallback = if ascii.is_empty() {
            format!("note-{}.md", full.note.id)
        } else {
            ascii
        };
        let encoded =
            percent_encoding::utf8_percent_encode(&filename, crate::files::QUOTE_SET).to_string();
        let value = format!("attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}");
        if let Ok(header) = value.parse() {
            response.headers_mut().insert(CONTENT_DISPOSITION, header);
        }
    }
    Ok(response)
}

#[derive(Deserialize)]
struct NewNoteBody {
    name: String,
    content: String,
    #[serde(default)]
    first_reminder_at: Option<Ts>,
    #[serde(default)]
    tag_ids: Vec<i64>,
    #[serde(default = "default_difficulty")]
    difficulty: Difficulty,
    #[serde(default)]
    project_id: Option<i64>,
    #[serde(default)]
    paused: Option<bool>,
    #[serde(default = "yes")]
    in_review: bool,
}

fn default_difficulty() -> Difficulty {
    Difficulty::Medium
}

fn yes() -> bool {
    true
}

async fn create_note(
    State(state): State<AppState>,
    Body(body): Body<NewNoteBody>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let mut tag_ids: Vec<i64> = vec![];
    if !body.tag_ids.is_empty() {
        let tags: Vec<TagRow> = sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {TAG_COLUMNS} FROM tags WHERE id IN ({}) ORDER BY id",
            id_list(&body.tag_ids)
        )))
        .fetch_all(&mut *tx)
        .await?;
        tag_ids = tags
            .into_iter()
            .filter(|t| !t.is_difficulty)
            .map(|t| t.id)
            .collect();
    }
    let project = match body.project_id {
        Some(id) => Some(live_project(&mut tx, id).await?),
        None => None,
    };
    let paused = body
        .paused
        .unwrap_or_else(|| project.as_ref().is_some_and(|p| p.paused));
    let algorithm = default_algorithm(&mut tx).await?;
    let tag = difficulty_tag(&mut tx, body.difficulty).await?;
    let note_id = insert_note(
        &mut tx,
        NewNote {
            name: &body.name,
            content: &body.content,
            algorithm,
            difficulty_tag: &tag,
            tag_ids,
            project_id: project.map(|p| p.id),
            first_reminder_at: body.first_reminder_at.unwrap_or_else(Ts::now),
            paused,
            in_review: body.in_review,
            created_at: None,
            updated_at: None,
        },
        None,
    )
    .await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

#[derive(Deserialize)]
struct UpdateNoteBody {
    name: String,
    content: String,
}

async fn update_note(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Body(body): Body<UpdateNoteBody>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    live_note(&mut tx, note_id).await?;
    sqlx::query("UPDATE notes SET name = ?, content = ?, updated_at = ? WHERE id = ?")
        .bind(&body.name)
        .bind(&body.content)
        .bind(Ts::now())
        .bind(note_id)
        .execute(&mut *tx)
        .await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

async fn empty_trash(State(state): State<AppState>) -> ApiResult<StatusCode> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let ids: Vec<i64> = sqlx::query_scalar("SELECT id FROM notes WHERE deleted_at IS NOT NULL")
        .fetch_all(&mut *tx)
        .await?;
    hard_delete_notes(&mut tx, &ids).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_note(State(state): State<AppState>, P(note_id): P<i64>) -> ApiResult<StatusCode> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    live_note(&mut tx, note_id).await?;
    sqlx::query("UPDATE notes SET deleted_at = ? WHERE id = ?")
        .bind(Ts::now())
        .bind(note_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn restore_note(
    State(state): State<AppState>,
    P(note_id): P<i64>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    match get_note_row(&mut tx, note_id).await? {
        Some(note) if note.deleted_at.is_some() => {}
        _ => return Err(ApiError::not_found("Note not found in trash")),
    }
    sqlx::query("UPDATE notes SET deleted_at = NULL WHERE id = ?")
        .bind(note_id)
        .execute(&mut *tx)
        .await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

async fn permanently_delete_note(
    State(state): State<AppState>,
    P(note_id): P<i64>,
) -> ApiResult<StatusCode> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    if get_note_row(&mut tx, note_id).await?.is_none() {
        return Err(ApiError::not_found("Note not found"));
    }
    hard_delete_notes(&mut tx, &[note_id]).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn find_tag(conn: &mut Conn, tag_id: i64) -> Result<Option<TagRow>, sqlx::Error> {
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {TAG_COLUMNS} FROM tags WHERE id = ?"
    )))
    .bind(tag_id)
    .fetch_optional(conn)
    .await
}

async fn attach_tag(
    State(state): State<AppState>,
    P((note_id, tag_id)): P<(i64, i64)>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    live_note(&mut tx, note_id).await?;
    let Some(tag) = find_tag(&mut tx, tag_id).await? else {
        return Err(ApiError::not_found("Tag not found"));
    };
    if tag.is_difficulty {
        return Err(ApiError::bad_request(
            "Use PATCH /notes/{note_id}/difficulty to change a note's difficulty",
        ));
    }
    sqlx::query("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)")
        .bind(note_id)
        .bind(tag_id)
        .execute(&mut *tx)
        .await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

async fn detach_tag(
    State(state): State<AppState>,
    P((note_id, tag_id)): P<(i64, i64)>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    live_note(&mut tx, note_id).await?;
    let attached: Option<bool> = sqlx::query_scalar(
        "SELECT tags.is_difficulty FROM note_tags JOIN tags ON tags.id = note_tags.tag_id \
         WHERE note_tags.note_id = ? AND note_tags.tag_id = ?",
    )
    .bind(note_id)
    .bind(tag_id)
    .fetch_optional(&mut *tx)
    .await?;
    if attached == Some(true) {
        return Err(ApiError::bad_request(
            "Difficulty tags can't be removed directly",
        ));
    }
    sqlx::query("DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?")
        .bind(note_id)
        .bind(tag_id)
        .execute(&mut *tx)
        .await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

pub async fn apply_difficulty(
    conn: &mut Conn,
    note_id: i64,
    difficulty: Difficulty,
) -> ApiResult<()> {
    let tag = difficulty_tag(conn, difficulty).await?;
    sqlx::query(
        "DELETE FROM note_tags WHERE note_id = ? AND tag_id IN (SELECT id FROM tags WHERE is_difficulty = 1) AND tag_id != ?",
    )
    .bind(note_id)
    .bind(tag.id)
    .execute(&mut *conn)
    .await?;
    sqlx::query("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)")
        .bind(note_id)
        .bind(tag.id)
        .execute(&mut *conn)
        .await?;
    if let Some(ease) = tag.default_ease_factor.filter(|e| *e != 0.0) {
        sqlx::query("UPDATE notes SET ease_factor = ? WHERE id = ?")
            .bind(ease)
            .bind(note_id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

#[derive(Deserialize)]
struct SetDifficultyBody {
    difficulty: Difficulty,
}

async fn set_note_difficulty(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Body(body): Body<SetDifficultyBody>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    live_note(&mut tx, note_id).await?;
    apply_difficulty(&mut tx, note_id, body.difficulty).await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

#[derive(Deserialize)]
struct SetProjectBody {
    #[serde(default)]
    project_id: Option<i64>,
}

async fn set_note_project(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Body(body): Body<SetProjectBody>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    live_note(&mut tx, note_id).await?;
    let project_id = match body.project_id {
        Some(id) => Some(live_project(&mut tx, id).await?.id),
        None => None,
    };
    sqlx::query("UPDATE notes SET project_id = ? WHERE id = ?")
        .bind(project_id)
        .bind(note_id)
        .execute(&mut *tx)
        .await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

async fn set_review_status(
    state: &AppState,
    note_id: i64,
    status: ReviewStatus,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let note = live_note(&mut tx, note_id).await?;
    let paused = status == ReviewStatus::Paused;
    if status == ReviewStatus::NoteOnly {
        remove_from_review(&mut tx, &Scope::Ids(vec![note_id])).await?;
    } else if !note.in_review {
        add_to_review(&mut tx, &Scope::Ids(vec![note_id]), paused, 0, 0).await?;
    } else if paused != note.paused_at.is_some() {
        let paused_at = paused.then(Ts::now);
        sqlx::query("UPDATE notes SET paused_at = ? WHERE id = ?")
            .bind(paused_at)
            .bind(note_id)
            .execute(&mut *tx)
            .await?;
    }
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

#[derive(Deserialize)]
struct SetPausedBody {
    paused: bool,
}

async fn set_note_paused(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Body(body): Body<SetPausedBody>,
) -> ApiResult<Json<NoteResponse>> {
    set_review_status(
        &state,
        note_id,
        if body.paused {
            ReviewStatus::Paused
        } else {
            ReviewStatus::Active
        },
    )
    .await
}

#[derive(Deserialize)]
struct SetStatusBody {
    status: ReviewStatus,
}

async fn set_note_status(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Body(body): Body<SetStatusBody>,
) -> ApiResult<Json<NoteResponse>> {
    set_review_status(&state, note_id, body.status).await
}

#[derive(Deserialize)]
struct RescheduleBody {
    remind_at: Ts,
}

async fn reschedule_pending_reminder(
    State(state): State<AppState>,
    P(note_id): P<i64>,
    Body(body): Body<RescheduleBody>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    live_note(&mut tx, note_id).await?;
    let pending: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM reminders WHERE note_id = ? AND deleted_at IS NULL AND reviewed_at IS NULL ORDER BY remind_at LIMIT 1",
    )
    .bind(note_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(reminder_id) = pending else {
        return Err(ApiError::not_found("Note has no pending reminder"));
    };
    sqlx::query("UPDATE reminders SET remind_at = ? WHERE id = ?")
        .bind(body.remind_at)
        .bind(reminder_id)
        .execute(&mut *tx)
        .await?;
    let response = note_response(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

async fn get_note_intervals(
    State(state): State<AppState>,
    P(note_id): P<i64>,
) -> ApiResult<Json<serde_json::Map<String, serde_json::Value>>> {
    let mut conn = state.db.acquire().await?;
    let note = live_note(&mut conn, note_id).await?;
    if !note.in_review || note.paused_at.is_some() {
        return Err(ApiError::bad_request("Note isn't in review"));
    }
    let previews = scheduling_of(&note)
        .preview(Ts::now())
        .map_err(ApiError::internal)?;
    let mut map = serde_json::Map::new();
    for (rating, due) in previews {
        map.insert(rating.as_str().into(), serde_json::Value::String(due.iso()));
    }
    Ok(Json(map))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum ReminderAction {
    Review,
    UndoReview,
}

#[derive(Deserialize)]
struct PatchReminderBody {
    action: ReminderAction,
    #[serde(default)]
    rating: Option<Rating>,
}

async fn reminder(conn: &mut Conn, reminder_id: i64) -> Result<Option<ReminderRow>, sqlx::Error> {
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {REMINDER_COLUMNS} FROM reminders WHERE id = ?"
    )))
    .bind(reminder_id)
    .fetch_optional(conn)
    .await
}

async fn patch_note_reminder(
    State(state): State<AppState>,
    P(reminder_id): P<i64>,
    Body(body): Body<PatchReminderBody>,
) -> ApiResult<Json<NoteResponse>> {
    let mut tx = state.db.begin_with(BEGIN_WRITE).await?;
    let Some(row) = reminder(&mut tx, reminder_id)
        .await?
        .filter(|r| r.deleted_at.is_none())
    else {
        return Err(ApiError::not_found("Reminder not found"));
    };
    let note = match row.note_id {
        Some(id) => get_note_row(&mut tx, id).await?,
        None => None,
    };
    let Some(note) = note else {
        return Err(ApiError::not_found("Note not found"));
    };
    if !note.in_review {
        return Err(ApiError::bad_request("Note isn't in review"));
    }
    let mut scheduling = scheduling_of(&note);
    match body.action {
        ReminderAction::Review => {
            let Some(rating) = body.rating else {
                return Err(ApiError::bad_request("rating is required to review"));
            };
            let now = Ts::now();
            let due = scheduling.review(rating, now).map_err(ApiError::internal)?;
            sqlx::query(
                "UPDATE notes SET ease_factor = ?, interval_days = ?, fsrs_card = ? WHERE id = ?",
            )
            .bind(scheduling.ease_factor)
            .bind(scheduling.interval_days)
            .bind(&scheduling.fsrs_card)
            .bind(note.id)
            .execute(&mut *tx)
            .await?;
            sqlx::query("UPDATE reminders SET reviewed_at = ?, rating = ? WHERE id = ?")
                .bind(Ts::now())
                .bind(rating.as_str())
                .bind(row.id)
                .execute(&mut *tx)
                .await?;
            insert_reminder(&mut tx, note.id, due, &scheduling.snapshot()).await?;
        }
        ReminderAction::UndoReview => {
            if row.reviewed_at.is_none() {
                return Err(ApiError::bad_request("Reminder was not reviewed"));
            }
            let latest: Option<i64> = sqlx::query_scalar(
                "SELECT id FROM reminders WHERE note_id = ? AND reviewed_at IS NOT NULL ORDER BY reviewed_at DESC LIMIT 1",
            )
            .bind(note.id)
            .fetch_optional(&mut *tx)
            .await?;
            if latest != Some(row.id) {
                return Err(ApiError::bad_request(
                    "Only the most recent review can be undone",
                ));
            }
            sqlx::query("DELETE FROM reminders WHERE note_id = ? AND reviewed_at IS NULL")
                .bind(note.id)
                .execute(&mut *tx)
                .await?;
            scheduling.restore(&Snapshot {
                ease_factor: row.ease_factor,
                interval_days: row.interval_days,
                fsrs_card: row.fsrs_card.clone(),
            });
            sqlx::query(
                "UPDATE notes SET ease_factor = ?, interval_days = ?, fsrs_card = ? WHERE id = ?",
            )
            .bind(scheduling.ease_factor)
            .bind(scheduling.interval_days)
            .bind(&scheduling.fsrs_card)
            .bind(note.id)
            .execute(&mut *tx)
            .await?;
            sqlx::query("UPDATE reminders SET reviewed_at = NULL, rating = NULL WHERE id = ?")
                .bind(row.id)
                .execute(&mut *tx)
                .await?;
        }
    }
    let response = note_response(&mut tx, note.id).await?;
    tx.commit().await?;
    Ok(Json(response))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/notes/list", get(get_notes))
        .route("/notes/ids", get(get_note_ids))
        .route("/notes/due", get(get_due_notes))
        .route("/notes/create", post(create_note))
        .route("/notes/trash", delete(empty_trash))
        .route(
            "/notes/reminders/{reminder_id}/now",
            patch(patch_note_reminder),
        )
        .route(
            "/notes/{note_id}",
            get(get_note).patch(update_note).delete(delete_note),
        )
        .route("/notes/{note_id}/markdown", get(get_note_markdown))
        .route("/notes/{note_id}/restore", patch(restore_note))
        .route(
            "/notes/{note_id}/permanent",
            delete(permanently_delete_note),
        )
        .route(
            "/notes/{note_id}/tags/{tag_id}",
            post(attach_tag).delete(detach_tag),
        )
        .route("/notes/{note_id}/difficulty", patch(set_note_difficulty))
        .route("/notes/{note_id}/project", patch(set_note_project))
        .route("/notes/{note_id}/paused", patch(set_note_paused))
        .route("/notes/{note_id}/status", patch(set_note_status))
        .route(
            "/notes/{note_id}/reminders/pending",
            patch(reschedule_pending_reminder),
        )
        .route("/notes/{note_id}/intervals", get(get_note_intervals))
}
