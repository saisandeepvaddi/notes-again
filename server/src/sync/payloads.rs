use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::AssertSqlSafe;

use crate::db::Conn;
use crate::db::models::{
    NOTE_COLUMNS, NoteRow, PROJECT_COLUMNS, ProjectRow, REMINDER_COLUMNS, ReminderRow, TAG_COLUMNS,
    TagRow,
};
use crate::notes::hard_delete_notes;
use crate::time::Ts;

pub type Payload = Map<String, Value>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Settings,
    Project,
    Tag,
    Note,
}

impl Kind {
    pub const ALL: [Kind; 4] = [Kind::Settings, Kind::Project, Kind::Tag, Kind::Note];

    pub fn index(&self) -> usize {
        Kind::ALL.iter().position(|k| k == self).unwrap_or(0)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Kind::Settings => "settings",
            Kind::Project => "project",
            Kind::Tag => "tag",
            Kind::Note => "note",
        }
    }

    pub fn parse(raw: &str) -> Option<Kind> {
        Kind::ALL.into_iter().find(|k| k.as_str() == raw)
    }

    pub fn table(&self) -> &'static str {
        match self {
            Kind::Settings => "settings",
            Kind::Project => "projects",
            Kind::Tag => "tags",
            Kind::Note => "notes",
        }
    }
}

pub const SETTINGS_UID: &str = "settings";
pub const TEXT_FIELDS: [&str; 2] = ["name", "content"];

fn ts(value: Option<Ts>) -> Value {
    value.map(|t| Value::String(t.iso())).unwrap_or(Value::Null)
}

fn float(value: Option<f64>) -> Value {
    value
        .and_then(serde_json::Number::from_f64)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

fn text(value: Option<&str>) -> Value {
    value
        .map(|s| Value::String(s.to_string()))
        .unwrap_or(Value::Null)
}

fn reminder_payload(r: &ReminderRow) -> Payload {
    let mut p = Map::new();
    p.insert("remind_at".into(), ts(Some(r.remind_at)));
    p.insert("created_at".into(), ts(Some(r.created_at)));
    p.insert("updated_at".into(), ts(Some(r.updated_at)));
    p.insert("deleted_at".into(), ts(r.deleted_at));
    p.insert("reviewed_at".into(), ts(r.reviewed_at));
    p.insert("rating".into(), text(r.rating.as_deref()));
    p.insert("ease_factor".into(), float(r.ease_factor));
    p.insert(
        "interval_days".into(),
        r.interval_days.map(Value::from).unwrap_or(Value::Null),
    );
    p.insert("fsrs_card".into(), text(r.fsrs_card.as_deref()));
    p
}

pub async fn find_project(conn: &mut Conn, uid: &str) -> Result<Option<ProjectRow>, sqlx::Error> {
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {PROJECT_COLUMNS} FROM projects WHERE uid = ?"
    )))
    .bind(uid)
    .fetch_optional(conn)
    .await
}

pub async fn find_tag(conn: &mut Conn, uid: &str) -> Result<Option<TagRow>, sqlx::Error> {
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {TAG_COLUMNS} FROM tags WHERE uid = ?"
    )))
    .bind(uid)
    .fetch_optional(conn)
    .await
}

pub async fn find_note(conn: &mut Conn, uid: &str) -> Result<Option<NoteRow>, sqlx::Error> {
    sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {NOTE_COLUMNS} FROM notes WHERE uid = ?"
    )))
    .bind(uid)
    .fetch_optional(conn)
    .await
}

#[derive(Clone, Debug)]
pub struct RowRef {
    pub id: i64,
    pub uid: String,
    pub sync_version: i64,
    pub name: Option<String>,
    pub content: Option<String>,
}

pub async fn find_row(
    conn: &mut Conn,
    kind: Kind,
    uid: &str,
) -> Result<Option<RowRef>, sqlx::Error> {
    Ok(match kind {
        Kind::Settings => {
            sqlx::query_as::<_, (i64, i64)>("SELECT id, sync_version FROM settings WHERE id = 1")
                .fetch_optional(conn)
                .await?
                .map(|(id, v)| RowRef {
                    id,
                    uid: SETTINGS_UID.into(),
                    sync_version: v,
                    name: None,
                    content: None,
                })
        }
        Kind::Project => find_project(conn, uid).await?.map(|p| RowRef {
            id: p.id,
            uid: p.uid,
            sync_version: p.sync_version,
            name: Some(p.name),
            content: None,
        }),
        Kind::Tag => find_tag(conn, uid).await?.map(|t| RowRef {
            id: t.id,
            uid: t.uid,
            sync_version: t.sync_version,
            name: Some(t.name),
            content: None,
        }),
        Kind::Note => find_note(conn, uid).await?.map(|n| RowRef {
            id: n.id,
            uid: n.uid,
            sync_version: n.sync_version,
            name: Some(n.name),
            content: Some(n.content),
        }),
    })
}

pub async fn find_by_name(
    conn: &mut Conn,
    kind: Kind,
    name: &str,
) -> Result<Option<RowRef>, sqlx::Error> {
    let table = kind.table();
    let row: Option<(i64, String, i64, String)> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT id, uid, sync_version, name FROM {table} WHERE lower(name) = ?"
    )))
    .bind(name.to_lowercase())
    .fetch_optional(conn)
    .await?;
    Ok(row.map(|(id, uid, sync_version, name)| RowRef {
        id,
        uid,
        sync_version,
        name: Some(name),
        content: None,
    }))
}

pub async fn dump(conn: &mut Conn, kind: Kind, uid: &str) -> Result<Option<Payload>, sqlx::Error> {
    let mut p = Map::new();
    match kind {
        Kind::Settings => {
            let row: Option<String> =
                sqlx::query_scalar("SELECT default_algorithm FROM settings WHERE id = 1")
                    .fetch_optional(conn)
                    .await?;
            let Some(algorithm) = row else {
                return Ok(None);
            };
            p.insert("default_algorithm".into(), Value::String(algorithm));
        }
        Kind::Project => {
            let Some(row) = find_project(conn, uid).await? else {
                return Ok(None);
            };
            p.insert("name".into(), Value::String(row.name));
            p.insert("created_at".into(), ts(Some(row.created_at)));
            p.insert("deleted_at".into(), ts(row.deleted_at));
            p.insert("paused".into(), Value::Bool(row.paused));
        }
        Kind::Tag => {
            let Some(row) = find_tag(conn, uid).await? else {
                return Ok(None);
            };
            p.insert("name".into(), Value::String(row.name));
            p.insert("created_at".into(), ts(Some(row.created_at)));
            p.insert("is_difficulty".into(), Value::Bool(row.is_difficulty));
            p.insert("default_ease_factor".into(), float(row.default_ease_factor));
        }
        Kind::Note => {
            let Some(note) = find_note(conn, uid).await? else {
                return Ok(None);
            };
            p.insert("name".into(), Value::String(note.name.clone()));
            p.insert("content".into(), Value::String(note.content.clone()));
            p.insert("created_at".into(), ts(Some(note.created_at)));
            p.insert("updated_at".into(), ts(Some(note.updated_at)));
            p.insert("deleted_at".into(), ts(note.deleted_at));
            p.insert("paused_at".into(), ts(note.paused_at));
            p.insert("in_review".into(), Value::Bool(note.in_review));
            p.insert("ease_factor".into(), float(Some(note.ease_factor)));
            p.insert("interval_days".into(), Value::from(note.interval_days));
            p.insert("algorithm".into(), Value::String(note.algorithm.clone()));
            p.insert("fsrs_card".into(), text(note.fsrs_card.as_deref()));
            let project_uid: Option<String> = match note.project_id {
                Some(id) => {
                    sqlx::query_scalar("SELECT uid FROM projects WHERE id = ?")
                        .bind(id)
                        .fetch_optional(&mut *conn)
                        .await?
                }
                None => None,
            };
            p.insert("project".into(), text(project_uid.as_deref()));
            let mut tags: Vec<String> = sqlx::query_scalar(
                "SELECT tags.uid FROM note_tags JOIN tags ON tags.id = note_tags.tag_id WHERE note_tags.note_id = ?",
            )
            .bind(note.id)
            .fetch_all(&mut *conn)
            .await?;
            tags.sort();
            p.insert(
                "tags".into(),
                Value::Array(tags.into_iter().map(Value::String).collect()),
            );
            let reminders: Vec<ReminderRow> = sqlx::query_as(AssertSqlSafe(format!(
                "SELECT {REMINDER_COLUMNS} FROM reminders WHERE note_id = ? ORDER BY id"
            )))
            .bind(note.id)
            .fetch_all(&mut *conn)
            .await?;
            let mut map = Map::new();
            for reminder in &reminders {
                map.insert(
                    reminder.uid.clone(),
                    Value::Object(reminder_payload(reminder)),
                );
            }
            p.insert("reminders".into(), Value::Object(map));
        }
    }
    Ok(Some(p))
}

fn get_ts(data: &Payload, key: &str, current: Option<Ts>) -> Option<Ts> {
    match data.get(key) {
        None => current,
        Some(Value::String(s)) => Ts::parse(s).or(current),
        Some(_) => None,
    }
}

fn get_str(data: &Payload, key: &str, current: Option<String>) -> Option<String> {
    match data.get(key) {
        None => current,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => None,
    }
}

fn get_f64(data: &Payload, key: &str, current: Option<f64>) -> Option<f64> {
    match data.get(key) {
        None => current,
        Some(v) => v.as_f64(),
    }
}

fn get_i64(data: &Payload, key: &str, current: Option<i64>) -> Option<i64> {
    match data.get(key) {
        None => current,
        Some(v) => v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)),
    }
}

fn get_bool(data: &Payload, key: &str, current: bool) -> bool {
    match data.get(key) {
        None => current,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(_) => false,
    }
}

async fn apply_reminders(conn: &mut Conn, note_id: i64, data: &Payload) -> Result<(), sqlx::Error> {
    let existing: Vec<ReminderRow> = sqlx::query_as(AssertSqlSafe(format!(
        "SELECT {REMINDER_COLUMNS} FROM reminders WHERE note_id = ?"
    )))
    .bind(note_id)
    .fetch_all(&mut *conn)
    .await?;
    let empty = Map::new();
    let incoming = data
        .get("reminders")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    for (uid, value) in incoming {
        let Some(fields) = value.as_object() else {
            continue;
        };
        let current = existing.iter().find(|r| &r.uid == uid);
        let now = Ts::now();
        let remind_at = get_ts(fields, "remind_at", current.map(|r| r.remind_at)).unwrap_or(now);
        let created_at = get_ts(fields, "created_at", current.map(|r| r.created_at)).unwrap_or(now);
        let updated_at = get_ts(fields, "updated_at", current.map(|r| r.updated_at)).unwrap_or(now);
        let deleted_at = get_ts(fields, "deleted_at", current.and_then(|r| r.deleted_at));
        let reviewed_at = get_ts(fields, "reviewed_at", current.and_then(|r| r.reviewed_at));
        let rating = get_str(fields, "rating", current.and_then(|r| r.rating.clone()));
        let ease = get_f64(fields, "ease_factor", current.and_then(|r| r.ease_factor));
        let interval = get_i64(
            fields,
            "interval_days",
            current.and_then(|r| r.interval_days),
        );
        let card = get_str(
            fields,
            "fsrs_card",
            current.and_then(|r| r.fsrs_card.clone()),
        );
        match current {
            Some(row)
                if row.remind_at == remind_at
                    && row.created_at == created_at
                    && row.updated_at == updated_at
                    && row.deleted_at == deleted_at
                    && row.reviewed_at == reviewed_at
                    && row.rating == rating
                    && row.ease_factor == ease
                    && row.interval_days == interval
                    && row.fsrs_card == card => {}
            Some(row) => {
                sqlx::query(
                    "UPDATE reminders SET remind_at = ?, created_at = ?, updated_at = ?, deleted_at = ?, reviewed_at = ?, \
                     rating = ?, ease_factor = ?, interval_days = ?, fsrs_card = ? WHERE id = ?",
                )
                .bind(remind_at)
                .bind(created_at)
                .bind(updated_at)
                .bind(deleted_at)
                .bind(reviewed_at)
                .bind(&rating)
                .bind(ease)
                .bind(interval)
                .bind(&card)
                .bind(row.id)
                .execute(&mut *conn)
                .await?;
            }
            None => {
                sqlx::query(
                    "INSERT INTO reminders (uid, remind_at, created_at, updated_at, deleted_at, reviewed_at, rating, \
                     ease_factor, interval_days, fsrs_card, note_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(uid)
                .bind(remind_at)
                .bind(created_at)
                .bind(updated_at)
                .bind(deleted_at)
                .bind(reviewed_at)
                .bind(&rating)
                .bind(ease)
                .bind(interval)
                .bind(&card)
                .bind(note_id)
                .execute(&mut *conn)
                .await?;
            }
        }
    }
    for row in existing.iter().filter(|r| !incoming.contains_key(&r.uid)) {
        sqlx::query("DELETE FROM reminders WHERE id = ?")
            .bind(row.id)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

async fn apply_note(
    conn: &mut Conn,
    uid: &str,
    data: &Payload,
    keep_text: bool,
) -> Result<(), sqlx::Error> {
    let existing = find_note(conn, uid).await?;
    let now = Ts::now();
    let keep_text = keep_text && existing.is_some();
    let base = existing.clone();
    let name = if keep_text {
        base.as_ref().map(|n| n.name.clone())
    } else {
        get_str(data, "name", base.as_ref().map(|n| n.name.clone()))
    };
    let content = if keep_text {
        base.as_ref().map(|n| n.content.clone())
    } else {
        get_str(data, "content", base.as_ref().map(|n| n.content.clone()))
    };
    let created_at = get_ts(data, "created_at", base.as_ref().map(|n| n.created_at)).unwrap_or(now);
    let updated_at = get_ts(data, "updated_at", base.as_ref().map(|n| n.updated_at)).unwrap_or(now);
    let deleted_at = get_ts(data, "deleted_at", base.as_ref().and_then(|n| n.deleted_at));
    let paused_at = get_ts(data, "paused_at", base.as_ref().and_then(|n| n.paused_at));
    let in_review = get_bool(data, "in_review", base.as_ref().is_none_or(|n| n.in_review));
    let ease = get_f64(
        data,
        "ease_factor",
        Some(base.as_ref().map(|n| n.ease_factor).unwrap_or(2.5)),
    )
    .unwrap_or(2.5);
    let interval = get_i64(
        data,
        "interval_days",
        Some(base.as_ref().map(|n| n.interval_days).unwrap_or(0)),
    )
    .unwrap_or(0);
    let algorithm = get_str(
        data,
        "algorithm",
        Some(
            base.as_ref()
                .map(|n| n.algorithm.clone())
                .unwrap_or_else(|| "sm2".into()),
        ),
    )
    .unwrap_or_else(|| "sm2".into());
    let card = get_str(
        data,
        "fsrs_card",
        base.as_ref().and_then(|n| n.fsrs_card.clone()),
    );
    let project_id = match data.get("project").and_then(Value::as_str) {
        Some(project_uid) => find_project(conn, project_uid).await?.map(|p| p.id),
        None => None,
    };
    let name = name.unwrap_or_default();
    let content = content.unwrap_or_default();
    let note_id = match &existing {
        Some(note)
            if note.name == name
                && note.content == content
                && note.created_at == created_at
                && note.updated_at == updated_at
                && note.deleted_at == deleted_at
                && note.paused_at == paused_at
                && note.in_review == in_review
                && note.ease_factor == ease
                && note.interval_days == interval
                && note.algorithm == algorithm
                && note.fsrs_card == card
                && note.project_id == project_id =>
        {
            note.id
        }
        Some(note) => {
            sqlx::query(
                "UPDATE notes SET name = ?, content = ?, created_at = ?, updated_at = ?, deleted_at = ?, paused_at = ?, \
                 in_review = ?, ease_factor = ?, interval_days = ?, algorithm = ?, fsrs_card = ?, project_id = ? WHERE id = ?",
            )
            .bind(&name)
            .bind(&content)
            .bind(created_at)
            .bind(updated_at)
            .bind(deleted_at)
            .bind(paused_at)
            .bind(in_review)
            .bind(ease)
            .bind(interval)
            .bind(&algorithm)
            .bind(&card)
            .bind(project_id)
            .bind(note.id)
            .execute(&mut *conn)
            .await?;
            note.id
        }
        None => sqlx::query(
            "INSERT INTO notes (uid, sync_version, name, content, created_at, updated_at, deleted_at, paused_at, in_review, \
             ease_factor, interval_days, algorithm, fsrs_card, user_id, project_id) \
             VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        )
        .bind(uid)
        .bind(&name)
        .bind(&content)
        .bind(created_at)
        .bind(updated_at)
        .bind(deleted_at)
        .bind(paused_at)
        .bind(in_review)
        .bind(ease)
        .bind(interval)
        .bind(&algorithm)
        .bind(&card)
        .bind(project_id)
        .execute(&mut *conn)
        .await?
        .last_insert_rowid(),
    };
    let wanted: Vec<String> = data
        .get("tags")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let wanted_ids: Vec<i64> = if wanted.is_empty() {
        vec![]
    } else {
        let placeholders = vec!["?"; wanted.len()].join(", ");
        let mut query = sqlx::query_scalar(AssertSqlSafe(format!(
            "SELECT id FROM tags WHERE uid IN ({placeholders})"
        )));
        for uid in &wanted {
            query = query.bind(uid.clone());
        }
        query.fetch_all(&mut *conn).await?
    };
    let current_ids: Vec<i64> =
        sqlx::query_scalar("SELECT tag_id FROM note_tags WHERE note_id = ?")
            .bind(note_id)
            .fetch_all(&mut *conn)
            .await?;
    for tag_id in current_ids.iter().filter(|id| !wanted_ids.contains(id)) {
        sqlx::query("DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?")
            .bind(note_id)
            .bind(tag_id)
            .execute(&mut *conn)
            .await?;
    }
    for tag_id in wanted_ids.iter().filter(|id| !current_ids.contains(id)) {
        sqlx::query("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)")
            .bind(note_id)
            .bind(tag_id)
            .execute(&mut *conn)
            .await?;
    }
    apply_reminders(conn, note_id, data).await
}

pub async fn apply(
    conn: &mut Conn,
    kind: Kind,
    uid: &str,
    data: &Payload,
    keep_text: bool,
) -> Result<(), sqlx::Error> {
    let now = Ts::now();
    match kind {
        Kind::Settings => {
            let current: Option<String> =
                sqlx::query_scalar("SELECT default_algorithm FROM settings WHERE id = 1")
                    .fetch_optional(&mut *conn)
                    .await?;
            let algorithm = get_str(
                data,
                "default_algorithm",
                Some(current.clone().unwrap_or_else(|| "fsrs".into())),
            )
            .unwrap_or_else(|| "fsrs".into());
            if current.is_some() {
                sqlx::query("UPDATE settings SET default_algorithm = ? WHERE id = 1")
                    .bind(algorithm)
                    .execute(conn)
                    .await?;
            } else {
                sqlx::query(
                    "INSERT INTO settings (id, sync_version, default_algorithm) VALUES (1, 0, ?)",
                )
                .bind(algorithm)
                .execute(conn)
                .await?;
            }
        }
        Kind::Project => {
            let existing = find_project(conn, uid).await?;
            let name = get_str(data, "name", existing.as_ref().map(|p| p.name.clone()))
                .unwrap_or_default();
            let created_at =
                get_ts(data, "created_at", existing.as_ref().map(|p| p.created_at)).unwrap_or(now);
            let deleted_at = get_ts(
                data,
                "deleted_at",
                existing.as_ref().and_then(|p| p.deleted_at),
            );
            let paused = get_bool(data, "paused", existing.as_ref().is_some_and(|p| p.paused));
            match existing {
                Some(p) => {
                    sqlx::query("UPDATE projects SET name = ?, created_at = ?, deleted_at = ?, paused = ? WHERE id = ?")
                        .bind(name)
                        .bind(created_at)
                        .bind(deleted_at)
                        .bind(paused)
                        .bind(p.id)
                        .execute(conn)
                        .await?;
                }
                None => {
                    sqlx::query(
                        "INSERT INTO projects (uid, sync_version, name, created_at, deleted_at, paused) VALUES (?, 0, ?, ?, ?, ?)",
                    )
                    .bind(uid)
                    .bind(name)
                    .bind(created_at)
                    .bind(deleted_at)
                    .bind(paused)
                    .execute(conn)
                    .await?;
                }
            }
        }
        Kind::Tag => {
            let existing = find_tag(conn, uid).await?;
            let name = get_str(data, "name", existing.as_ref().map(|t| t.name.clone()))
                .unwrap_or_default();
            let created_at =
                get_ts(data, "created_at", existing.as_ref().map(|t| t.created_at)).unwrap_or(now);
            let is_difficulty = get_bool(
                data,
                "is_difficulty",
                existing.as_ref().is_some_and(|t| t.is_difficulty),
            );
            let ease = get_f64(
                data,
                "default_ease_factor",
                existing.as_ref().and_then(|t| t.default_ease_factor),
            );
            match existing {
                Some(t) => {
                    sqlx::query(
                        "UPDATE tags SET name = ?, created_at = ?, is_difficulty = ?, default_ease_factor = ? WHERE id = ?",
                    )
                    .bind(name)
                    .bind(created_at)
                    .bind(is_difficulty)
                    .bind(ease)
                    .bind(t.id)
                    .execute(conn)
                    .await?;
                }
                None => {
                    sqlx::query(
                        "INSERT INTO tags (uid, sync_version, name, created_at, is_difficulty, default_ease_factor) \
                         VALUES (?, 0, ?, ?, ?, ?)",
                    )
                    .bind(uid)
                    .bind(name)
                    .bind(created_at)
                    .bind(is_difficulty)
                    .bind(ease)
                    .execute(conn)
                    .await?;
                }
            }
        }
        Kind::Note => apply_note(conn, uid, data, keep_text).await?,
    }
    Ok(())
}

pub async fn delete_row(conn: &mut Conn, kind: Kind, row: &RowRef) -> Result<(), sqlx::Error> {
    match kind {
        Kind::Settings => {
            sqlx::query("DELETE FROM settings WHERE id = 1")
                .execute(conn)
                .await?;
        }
        Kind::Project => {
            sqlx::query("UPDATE notes SET project_id = NULL WHERE project_id = ?")
                .bind(row.id)
                .execute(&mut *conn)
                .await?;
            sqlx::query("DELETE FROM projects WHERE id = ?")
                .bind(row.id)
                .execute(conn)
                .await?;
        }
        Kind::Tag => {
            sqlx::query("DELETE FROM note_tags WHERE tag_id = ?")
                .bind(row.id)
                .execute(&mut *conn)
                .await?;
            sqlx::query("DELETE FROM tags WHERE id = ?")
                .bind(row.id)
                .execute(conn)
                .await?;
        }
        Kind::Note => hard_delete_notes(conn, &[row.id]).await?,
    }
    Ok(())
}

pub async fn set_uid(conn: &mut Conn, kind: Kind, id: i64, uid: &str) -> Result<(), sqlx::Error> {
    sqlx::query(AssertSqlSafe(format!(
        "UPDATE {} SET uid = ? WHERE id = ?",
        kind.table()
    )))
    .bind(uid)
    .bind(id)
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn load_base(
    conn: &mut Conn,
    kind: Kind,
    uid: &str,
) -> Result<Option<Payload>, sqlx::Error> {
    let text: Option<String> =
        sqlx::query_scalar("SELECT payload FROM sync_bases WHERE kind = ? AND uid = ?")
            .bind(kind.as_str())
            .bind(uid)
            .fetch_optional(conn)
            .await?;
    Ok(text.and_then(|t| serde_json::from_str::<Payload>(&t).ok()))
}

pub async fn save_base(
    conn: &mut Conn,
    kind: Kind,
    uid: &str,
    data: Option<&Payload>,
) -> Result<(), sqlx::Error> {
    match data {
        None => {
            sqlx::query("DELETE FROM sync_bases WHERE kind = ? AND uid = ?")
                .bind(kind.as_str())
                .bind(uid)
                .execute(conn)
                .await?;
        }
        Some(payload) => {
            let mut sorted: Vec<(&String, &Value)> = payload.iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(b.0));
            let ordered: Map<String, Value> = sorted
                .into_iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            sqlx::query(
                "INSERT INTO sync_bases (kind, uid, payload) VALUES (?, ?, ?) \
                 ON CONFLICT(kind, uid) DO UPDATE SET payload = excluded.payload",
            )
            .bind(kind.as_str())
            .bind(uid)
            .bind(serde_json::to_string(&ordered).unwrap_or_default())
            .execute(conn)
            .await?;
        }
    }
    Ok(())
}

pub async fn set_applying(conn: &mut Conn, applying: bool) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE sync_state SET applying = ? WHERE id = 1")
        .bind(applying)
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn current_version(conn: &mut Conn) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT version FROM sync_state WHERE id = 1")
        .fetch_one(conn)
        .await
}

pub async fn tombstoned(conn: &mut Conn, kind: Kind, uid: &str) -> Result<bool, sqlx::Error> {
    let found: Option<i64> =
        sqlx::query_scalar("SELECT version FROM sync_tombstones WHERE kind = ? AND uid = ?")
            .bind(kind.as_str())
            .bind(uid)
            .fetch_optional(conn)
            .await?;
    Ok(found.is_some())
}
