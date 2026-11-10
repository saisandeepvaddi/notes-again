pub mod bulk;
pub mod bulk_routes;
pub mod markdown;
pub mod pacing;
pub mod revisions;
pub mod routes;

use std::collections::HashMap;

use serde::Serialize;
use sqlx::AssertSqlSafe;

use crate::db::Conn;
use crate::db::models::{
    NOTE_COLUMNS, NoteRow, PROJECT_COLUMNS, ProjectResponse, ProjectRow, REMINDER_COLUMNS,
    ReminderRow, TAG_COLUMNS, TagResponse, TagRow, new_uid,
};
use crate::difficulty::Difficulty;
use crate::error::ApiError;
use crate::params::id_list;
use crate::scheduling::{Algorithm, SchedulingState, Snapshot, new_card_json};
use crate::time::Ts;

pub const CHUNK: usize = 900;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, Serialize)]
pub enum ReviewStatus {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "paused")]
    Paused,
    #[serde(rename = "note-only")]
    NoteOnly,
}

impl ReviewStatus {
    pub fn of(note: &NoteRow) -> ReviewStatus {
        if !note.in_review {
            ReviewStatus::NoteOnly
        } else if note.paused_at.is_some() {
            ReviewStatus::Paused
        } else {
            ReviewStatus::Active
        }
    }
}

#[derive(Serialize)]
pub struct ReminderResponse {
    pub id: i64,
    pub remind_at: Ts,
    pub reviewed_at: Option<Ts>,
    pub rating: Option<String>,
}

#[derive(Serialize)]
pub struct NoteResponse {
    pub id: i64,
    pub name: String,
    pub content: String,
    pub created_at: Ts,
    pub updated_at: Ts,
    pub ease_factor: f64,
    pub interval_days: i64,
    pub algorithm: String,
    pub paused_at: Option<Ts>,
    pub in_review: bool,
    pub reminders: Vec<ReminderResponse>,
    pub tags: Vec<TagResponse>,
    pub project: Option<ProjectResponse>,
}

#[derive(Clone, Debug)]
pub struct FullNote {
    pub note: NoteRow,
    pub reminders: Vec<ReminderRow>,
    pub tags: Vec<TagRow>,
    pub project: Option<ProjectRow>,
}

impl FullNote {
    pub fn response(&self) -> NoteResponse {
        let n = &self.note;
        NoteResponse {
            id: n.id,
            name: n.name.clone(),
            content: n.content.clone(),
            created_at: n.created_at,
            updated_at: n.updated_at,
            ease_factor: n.ease_factor,
            interval_days: n.interval_days,
            algorithm: n.algorithm.clone(),
            paused_at: n.paused_at,
            in_review: n.in_review,
            reminders: self
                .reminders
                .iter()
                .map(|r| ReminderResponse {
                    id: r.id,
                    remind_at: r.remind_at,
                    reviewed_at: r.reviewed_at,
                    rating: r.rating.clone(),
                })
                .collect(),
            tags: self.tags.iter().map(TagResponse::from).collect(),
            project: self.project.as_ref().map(ProjectResponse::from),
        }
    }
}

pub fn scheduling_of(note: &NoteRow) -> SchedulingState {
    SchedulingState {
        algorithm: note.algorithm.clone(),
        ease_factor: note.ease_factor,
        interval_days: note.interval_days,
        fsrs_card: note.fsrs_card.clone(),
    }
}

pub async fn load_full(conn: &mut Conn, ids: &[i64]) -> Result<Vec<FullNote>, sqlx::Error> {
    let mut notes: HashMap<i64, NoteRow> = HashMap::new();
    let mut reminders: HashMap<i64, Vec<ReminderRow>> = HashMap::new();
    let mut tags: HashMap<i64, Vec<TagRow>> = HashMap::new();
    for chunk in ids.chunks(CHUNK) {
        let list = id_list(chunk);
        let rows: Vec<NoteRow> = sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {NOTE_COLUMNS} FROM notes WHERE id IN ({list})"
        )))
        .fetch_all(&mut *conn)
        .await?;
        notes.extend(rows.into_iter().map(|n| (n.id, n)));
        let rows: Vec<ReminderRow> = sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {REMINDER_COLUMNS} FROM reminders WHERE note_id IN ({list}) \
             ORDER BY note_id, reviewed_at, deleted_at, remind_at, id"
        )))
        .fetch_all(&mut *conn)
        .await?;
        for row in rows {
            reminders
                .entry(row.note_id.unwrap_or_default())
                .or_default()
                .push(row);
        }
        let rows: Vec<(i64, TagRow)> = sqlx::query_as::<_, TagWithNote>(AssertSqlSafe(format!(
            "SELECT note_tags.note_id AS note_id, {TAG_COLUMNS} FROM note_tags JOIN tags ON tags.id = note_tags.tag_id \
             WHERE note_tags.note_id IN ({list}) ORDER BY note_tags.note_id, note_tags.tag_id"
        )))
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .map(|t| (t.note_id, t.tag))
        .collect();
        for (note_id, tag) in rows {
            tags.entry(note_id).or_default().push(tag);
        }
    }
    let project_ids: Vec<i64> = {
        let mut ids: Vec<i64> = notes.values().filter_map(|n| n.project_id).collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    };
    let mut projects: HashMap<i64, ProjectRow> = HashMap::new();
    for chunk in project_ids.chunks(CHUNK) {
        let rows: Vec<ProjectRow> = sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {PROJECT_COLUMNS} FROM projects WHERE id IN ({})",
            id_list(chunk)
        )))
        .fetch_all(&mut *conn)
        .await?;
        projects.extend(rows.into_iter().map(|p| (p.id, p)));
    }
    Ok(ids
        .iter()
        .filter_map(|id| {
            let note = notes.remove(id)?;
            let project = note.project_id.and_then(|pid| projects.get(&pid).cloned());
            Some(FullNote {
                reminders: reminders.remove(id).unwrap_or_default(),
                tags: tags.remove(id).unwrap_or_default(),
                project,
                note,
            })
        })
        .collect())
}

#[derive(sqlx::FromRow)]
struct TagWithNote {
    note_id: i64,
    #[sqlx(flatten)]
    tag: TagRow,
}

pub async fn load_responses(
    conn: &mut Conn,
    ids: &[i64],
) -> Result<Vec<NoteResponse>, sqlx::Error> {
    Ok(load_full(conn, ids)
        .await?
        .iter()
        .map(FullNote::response)
        .collect())
}

pub async fn get_note_row(conn: &mut Conn, id: i64) -> Result<Option<NoteRow>, sqlx::Error> {
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?"
    )))
    .bind(id)
    .fetch_optional(conn)
    .await
}

pub async fn live_note(conn: &mut Conn, id: i64) -> Result<NoteRow, ApiError> {
    match get_note_row(conn, id).await? {
        Some(note) if note.deleted_at.is_none() => Ok(note),
        _ => Err(ApiError::not_found("Note not found")),
    }
}

pub async fn note_response(conn: &mut Conn, id: i64) -> Result<NoteResponse, ApiError> {
    load_responses(conn, &[id])
        .await?
        .pop()
        .ok_or_else(|| ApiError::not_found("Note not found"))
}

pub async fn difficulty_tag(conn: &mut Conn, difficulty: Difficulty) -> Result<TagRow, ApiError> {
    let tag: Option<TagRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {TAG_COLUMNS} FROM tags WHERE name = ?"
    )))
    .bind(difficulty.tag().name)
    .fetch_optional(conn)
    .await?;
    tag.ok_or_else(|| ApiError::internal("Difficulty tag missing"))
}

pub async fn live_project(conn: &mut Conn, project_id: i64) -> Result<ProjectRow, ApiError> {
    let project: Option<ProjectRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ? AND deleted_at IS NULL"
    )))
    .bind(project_id)
    .fetch_optional(conn)
    .await?;
    project.ok_or_else(|| ApiError::not_found("Project not found"))
}

pub async fn default_algorithm(conn: &mut Conn) -> Result<Algorithm, sqlx::Error> {
    let raw: Option<String> =
        sqlx::query_scalar("SELECT default_algorithm FROM settings WHERE id = 1")
            .fetch_optional(conn)
            .await?;
    Ok(raw
        .as_deref()
        .and_then(Algorithm::parse)
        .unwrap_or(Algorithm::Fsrs))
}

pub async fn insert_reminder(
    conn: &mut Conn,
    note_id: i64,
    remind_at: Ts,
    snapshot: &Snapshot,
) -> Result<i64, sqlx::Error> {
    let now = Ts::now();
    Ok(sqlx::query(
        "INSERT INTO reminders (uid, remind_at, created_at, updated_at, ease_factor, interval_days, fsrs_card, note_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_uid())
    .bind(remind_at)
    .bind(now)
    .bind(now)
    .bind(snapshot.ease_factor)
    .bind(snapshot.interval_days)
    .bind(&snapshot.fsrs_card)
    .bind(note_id)
    .execute(conn)
    .await?
    .last_insert_rowid())
}

pub struct NewNote<'a> {
    pub name: &'a str,
    pub content: &'a str,
    pub algorithm: Algorithm,
    pub difficulty_tag: &'a TagRow,
    pub tag_ids: Vec<i64>,
    pub project_id: Option<i64>,
    pub first_reminder_at: Ts,
    pub paused: bool,
    pub in_review: bool,
    pub created_at: Option<Ts>,
    pub updated_at: Option<Ts>,
}

pub struct PastReview {
    pub due_at: Ts,
    pub reviewed_at: Ts,
    pub rating: String,
    pub snapshot: Snapshot,
}

pub struct RestoredReview {
    pub algorithm: Algorithm,
    pub ease_factor: Option<f64>,
    pub interval_days: Option<i64>,
    pub fsrs_card: Option<String>,
    pub history: Vec<PastReview>,
    pub pending_due: Option<Ts>,
}

pub async fn insert_note(
    conn: &mut Conn,
    new: NewNote<'_>,
    restored: Option<RestoredReview>,
) -> Result<i64, sqlx::Error> {
    let now = Ts::now();
    let mut state = SchedulingState {
        algorithm: new.algorithm.as_str().to_string(),
        ease_factor: new
            .difficulty_tag
            .default_ease_factor
            .filter(|e| *e != 0.0)
            .unwrap_or(2.5),
        interval_days: 0,
        fsrs_card: new_card_json(new.algorithm, now),
    };
    let created_at = new.created_at.unwrap_or(now);
    let updated_at = new.updated_at.unwrap_or(now);
    if let Some(review) = &restored {
        state.algorithm = review.algorithm.as_str().to_string();
        if let Some(ease) = review.ease_factor {
            state.ease_factor = ease;
        }
        if let Some(interval) = review.interval_days {
            state.interval_days = interval;
        }
        state.fsrs_card = review.fsrs_card.clone();
    }
    let paused_at = (new.paused && new.in_review).then_some(now);
    let note_id = sqlx::query(
        "INSERT INTO notes (uid, sync_version, name, content, created_at, updated_at, deleted_at, paused_at, in_review, \
         ease_factor, interval_days, algorithm, fsrs_card, user_id, project_id) \
         VALUES (?, 0, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1, ?)",
    )
    .bind(new_uid())
    .bind(new.name)
    .bind(new.content)
    .bind(created_at)
    .bind(updated_at)
    .bind(paused_at)
    .bind(new.in_review)
    .bind(state.ease_factor)
    .bind(state.interval_days)
    .bind(&state.algorithm)
    .bind(&state.fsrs_card)
    .bind(new.project_id)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();
    let mut tag_ids = new.tag_ids.clone();
    tag_ids.push(new.difficulty_tag.id);
    for tag_id in crate::params::dedupe(&tag_ids) {
        sqlx::query("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)")
            .bind(note_id)
            .bind(tag_id)
            .execute(&mut *conn)
            .await?;
    }
    match restored {
        Some(review) => {
            for past in &review.history {
                let stamp = Ts::now();
                sqlx::query(
                    "INSERT INTO reminders (uid, remind_at, created_at, updated_at, reviewed_at, rating, ease_factor, \
                     interval_days, fsrs_card, note_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(new_uid())
                .bind(past.due_at)
                .bind(stamp)
                .bind(stamp)
                .bind(past.reviewed_at)
                .bind(&past.rating)
                .bind(past.snapshot.ease_factor)
                .bind(past.snapshot.interval_days)
                .bind(&past.snapshot.fsrs_card)
                .bind(note_id)
                .execute(&mut *conn)
                .await?;
            }
            if new.in_review {
                let due = review.pending_due.unwrap_or(new.first_reminder_at);
                insert_reminder(conn, note_id, due, &state.snapshot()).await?;
            }
        }
        None => {
            if new.in_review {
                insert_reminder(conn, note_id, new.first_reminder_at, &state.snapshot()).await?;
            }
        }
    }
    Ok(note_id)
}

pub async fn hard_delete_notes(conn: &mut Conn, ids: &[i64]) -> Result<(), sqlx::Error> {
    for chunk in ids.chunks(CHUNK) {
        let list = id_list(chunk);
        sqlx::query(AssertSqlSafe(format!(
            "DELETE FROM reminders WHERE note_id IN ({list})"
        )))
        .execute(&mut *conn)
        .await?;
        sqlx::query(AssertSqlSafe(format!(
            "DELETE FROM note_tags WHERE note_id IN ({list})"
        )))
        .execute(&mut *conn)
        .await?;
        sqlx::query(AssertSqlSafe(format!(
            "DELETE FROM notes WHERE id IN ({list})"
        )))
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}
