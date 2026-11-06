use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::AssertSqlSafe;

use super::pacing::{MAX_PER_DAY, Pacer};
use super::{CHUNK, scheduling_of};
use crate::db::Conn;
use crate::db::models::{NOTE_COLUMNS, NoteRow};
use crate::error::ApiResult;
use crate::params::{check_range, id_list};
use crate::time::Ts;

pub const MAX_BULK_IDS: usize = 10_000;

#[derive(Clone, Debug)]
pub enum Scope {
    Ids(Vec<i64>),
    Project(i64),
    Tag(i64),
}

impl Scope {
    fn conditions(&self) -> Vec<String> {
        match self {
            Scope::Ids(ids) => ids
                .chunks(CHUNK)
                .map(|c| format!("notes.id IN ({})", id_list(c)))
                .collect(),
            Scope::Project(id) => vec![format!("notes.project_id = {id}")],
            Scope::Tag(id) => vec![format!(
                "notes.id IN (SELECT note_id FROM note_tags WHERE tag_id = {id})"
            )],
        }
    }
}

#[derive(Serialize)]
pub struct GroupDeleteResult {
    pub notes_trashed: i64,
    pub notes_kept: i64,
    pub tags_deleted: i64,
}

#[derive(Deserialize)]
pub struct ResumeOptions {
    #[serde(default = "default_per_day")]
    pub per_day: i64,
    #[serde(default)]
    pub tz_offset_minutes: i64,
}

fn default_per_day() -> i64 {
    10
}

impl ResumeOptions {
    pub fn validate(&self) -> ApiResult<()> {
        check_range("per_day", self.per_day, 0, MAX_PER_DAY)?;
        check_range(
            "tz_offset_minutes",
            self.tz_offset_minutes,
            -24 * 60,
            24 * 60,
        )
    }
}

#[derive(Serialize, Default)]
pub struct ResumeResult {
    pub affected: i64,
    pub due_today: i64,
    pub days_span: i64,
}

pub async fn trash_notes(conn: &mut Conn, scope: &Scope) -> Result<i64, sqlx::Error> {
    let now = Ts::now();
    let mut affected = 0;
    for condition in scope.conditions() {
        affected += sqlx::query(AssertSqlSafe(format!(
            "UPDATE notes SET deleted_at = ? WHERE deleted_at IS NULL AND {condition}"
        )))
        .bind(now)
        .execute(&mut *conn)
        .await?
        .rows_affected() as i64;
    }
    Ok(affected)
}

pub async fn pause_notes(conn: &mut Conn, scope: &Scope) -> Result<i64, sqlx::Error> {
    let now = Ts::now();
    let mut affected = 0;
    for condition in scope.conditions() {
        affected += sqlx::query(AssertSqlSafe(format!(
            "UPDATE notes SET paused_at = ? WHERE deleted_at IS NULL AND in_review = 1 AND paused_at IS NULL AND {condition}"
        )))
        .bind(now)
        .execute(&mut *conn)
        .await?
        .rows_affected() as i64;
    }
    Ok(affected)
}

async fn matching_ids(
    conn: &mut Conn,
    filter: &str,
    scope: &Scope,
) -> Result<Vec<i64>, sqlx::Error> {
    let mut found: Vec<i64> = vec![];
    for condition in scope.conditions() {
        let ids: Vec<i64> = sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT notes.id FROM notes WHERE {filter} AND {condition} ORDER BY notes.id"
        )))
        .fetch_all(&mut *conn)
        .await?;
        found.extend(ids);
    }
    if let Scope::Ids(requested) = scope {
        let set: HashSet<i64> = found.into_iter().collect();
        return Ok(requested
            .iter()
            .copied()
            .filter(|id| set.contains(id))
            .collect());
    }
    Ok(found)
}

pub async fn resume_notes(
    conn: &mut Conn,
    scope: &Scope,
    per_day: i64,
    tz_offset_minutes: i64,
) -> Result<ResumeResult, sqlx::Error> {
    let ids = matching_ids(
        conn,
        "notes.deleted_at IS NULL AND notes.paused_at IS NOT NULL",
        scope,
    )
    .await?;
    if ids.is_empty() {
        return Ok(ResumeResult::default());
    }
    let mut pacer = Pacer::new(tz_offset_minutes);
    let now = pacer.now;
    let mut pending: Vec<(Ts, i64, i64)> = vec![];
    let mut reviewed: HashSet<i64> = HashSet::new();
    for chunk in ids.chunks(CHUNK) {
        let list = id_list(chunk);
        let rows: Vec<(Ts, i64, i64)> = sqlx::query_as(AssertSqlSafe(format!(
            "SELECT remind_at, note_id, id FROM reminders WHERE note_id IN ({list}) AND deleted_at IS NULL AND reviewed_at IS NULL"
        )))
        .fetch_all(&mut *conn)
        .await?;
        pending.extend(rows);
        let done: Vec<i64> = sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT note_id FROM reminders WHERE note_id IN ({list}) AND reviewed_at IS NOT NULL"
        )))
        .fetch_all(&mut *conn)
        .await?;
        reviewed.extend(done);
    }
    let mut due: Vec<(Ts, i64, i64)> = pending.into_iter().filter(|row| row.0 <= now).collect();
    due.sort();
    let due_new: Vec<&(Ts, i64, i64)> = if per_day > 0 {
        due.iter()
            .filter(|row| !reviewed.contains(&row.1))
            .collect()
    } else {
        vec![]
    };
    let days: Vec<i64> = (0..due_new.len() as i64)
        .map(|position| pacer.day(position, per_day))
        .collect();
    for (row, day) in due_new.iter().zip(&days) {
        let due_at = pacer.due_at(*day);
        sqlx::query("UPDATE reminders SET remind_at = ? WHERE id = ?")
            .bind(due_at)
            .bind(row.2)
            .execute(&mut *conn)
            .await?;
    }
    for chunk in ids.chunks(CHUNK) {
        sqlx::query(AssertSqlSafe(format!(
            "UPDATE notes SET paused_at = NULL WHERE id IN ({})",
            id_list(chunk)
        )))
        .execute(&mut *conn)
        .await?;
    }
    Ok(ResumeResult {
        affected: ids.len() as i64,
        due_today: due.len() as i64 - days.iter().filter(|d| **d > 0).count() as i64,
        days_span: days.iter().copied().max().unwrap_or(-1) + 1,
    })
}

pub async fn remove_from_review(conn: &mut Conn, scope: &Scope) -> Result<i64, sqlx::Error> {
    let ids = matching_ids(
        conn,
        "notes.deleted_at IS NULL AND notes.in_review = 1",
        scope,
    )
    .await?;
    for chunk in ids.chunks(CHUNK) {
        let list = id_list(chunk);
        sqlx::query(AssertSqlSafe(format!(
            "DELETE FROM reminders WHERE note_id IN ({list}) AND reviewed_at IS NULL"
        )))
        .execute(&mut *conn)
        .await?;
        sqlx::query(AssertSqlSafe(format!(
            "UPDATE notes SET in_review = 0, paused_at = NULL WHERE id IN ({list})"
        )))
        .execute(&mut *conn)
        .await?;
    }
    Ok(ids.len() as i64)
}

pub async fn add_to_review(
    conn: &mut Conn,
    scope: &Scope,
    paused: bool,
    per_day: i64,
    tz_offset_minutes: i64,
) -> Result<ResumeResult, sqlx::Error> {
    let ids = matching_ids(
        conn,
        "notes.deleted_at IS NULL AND notes.in_review = 0",
        scope,
    )
    .await?;
    if ids.is_empty() {
        return Ok(ResumeResult::default());
    }
    let mut pacer = Pacer::new(tz_offset_minutes);
    let effective_per_day = if paused { 0 } else { per_day };
    let day_by_id: HashMap<i64, i64> = ids
        .iter()
        .enumerate()
        .map(|(position, id)| (*id, pacer.day(position as i64, effective_per_day)))
        .collect();
    let paused_at = paused.then(Ts::now);
    for chunk in ids.chunks(CHUNK) {
        let mut notes: Vec<NoteRow> = sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {NOTE_COLUMNS} FROM notes WHERE id IN ({})",
            id_list(chunk)
        )))
        .fetch_all(&mut *conn)
        .await?;
        notes.sort_by_key(|note| day_by_id[&note.id]);
        for note in notes {
            let due_at = pacer.due_at(day_by_id[&note.id]);
            super::insert_reminder(conn, note.id, due_at, &scheduling_of(&note).snapshot()).await?;
            sqlx::query("UPDATE notes SET in_review = 1, paused_at = ? WHERE id = ?")
                .bind(paused_at)
                .bind(note.id)
                .execute(&mut *conn)
                .await?;
        }
    }
    let days: Vec<i64> = if paused {
        vec![]
    } else {
        ids.iter().map(|id| day_by_id[id]).collect()
    };
    Ok(ResumeResult {
        affected: ids.len() as i64,
        due_today: days.iter().filter(|d| **d == 0).count() as i64,
        days_span: days.iter().copied().max().unwrap_or(-1) + 1,
    })
}

pub async fn delete_unused_tags(conn: &mut Conn, among: Option<&str>) -> Result<i64, sqlx::Error> {
    let among = among
        .map(|sql| format!(" AND tags.id IN ({sql})"))
        .unwrap_or_default();
    let ids: Vec<i64> = sqlx::query_scalar(AssertSqlSafe(format!(
        "SELECT tags.id FROM tags WHERE tags.is_difficulty = 0 AND tags.id NOT IN (\
           SELECT note_tags.tag_id FROM note_tags JOIN notes ON notes.id = note_tags.note_id \
           WHERE notes.deleted_at IS NULL){among}"
    )))
    .fetch_all(&mut *conn)
    .await?;
    for chunk in ids.chunks(CHUNK) {
        let list = id_list(chunk);
        sqlx::query(AssertSqlSafe(format!(
            "DELETE FROM note_tags WHERE tag_id IN ({list})"
        )))
        .execute(&mut *conn)
        .await?;
        sqlx::query(AssertSqlSafe(format!(
            "DELETE FROM tags WHERE id IN ({list})"
        )))
        .execute(&mut *conn)
        .await?;
    }
    Ok(ids.len() as i64)
}
