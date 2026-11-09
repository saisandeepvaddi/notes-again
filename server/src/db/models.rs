use serde::Serialize;
use sqlx::FromRow;

use crate::time::Ts;

pub fn new_uid() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

#[derive(Clone, Debug, FromRow)]
pub struct NoteRow {
    pub id: i64,
    pub uid: String,
    pub sync_version: i64,
    pub name: String,
    pub content: String,
    pub created_at: Ts,
    pub updated_at: Ts,
    pub deleted_at: Option<Ts>,
    pub paused_at: Option<Ts>,
    pub in_review: bool,
    pub ease_factor: f64,
    pub interval_days: i64,
    pub algorithm: String,
    pub fsrs_card: Option<String>,
    pub project_id: Option<i64>,
}

pub const NOTE_COLUMNS: &str = "notes.id, notes.uid, notes.sync_version, notes.name, notes.content, \
    notes.created_at, notes.updated_at, notes.deleted_at, notes.paused_at, notes.in_review, \
    notes.ease_factor, notes.interval_days, notes.algorithm, notes.fsrs_card, notes.project_id";

#[derive(Clone, Debug, FromRow)]
pub struct ReminderRow {
    pub id: i64,
    pub uid: String,
    pub remind_at: Ts,
    pub created_at: Ts,
    pub updated_at: Ts,
    pub deleted_at: Option<Ts>,
    pub reviewed_at: Option<Ts>,
    pub rating: Option<String>,
    pub ease_factor: Option<f64>,
    pub interval_days: Option<i64>,
    pub fsrs_card: Option<String>,
    pub note_id: Option<i64>,
}

pub const REMINDER_COLUMNS: &str = "id, uid, remind_at, created_at, updated_at, deleted_at, reviewed_at, \
    rating, ease_factor, interval_days, fsrs_card, note_id";

#[derive(Clone, Debug, FromRow)]
pub struct TagRow {
    pub id: i64,
    pub uid: String,
    pub sync_version: i64,
    pub name: String,
    pub created_at: Ts,
    pub is_difficulty: bool,
    pub default_ease_factor: Option<f64>,
}

pub const TAG_COLUMNS: &str = "tags.id, tags.uid, tags.sync_version, tags.name, tags.created_at, tags.is_difficulty, tags.default_ease_factor";

#[derive(Clone, Debug, FromRow)]
pub struct ProjectRow {
    pub id: i64,
    pub uid: String,
    pub sync_version: i64,
    pub name: String,
    pub created_at: Ts,
    pub deleted_at: Option<Ts>,
    pub paused: bool,
}

pub const PROJECT_COLUMNS: &str = "projects.id, projects.uid, projects.sync_version, projects.name, \
    projects.created_at, projects.deleted_at, projects.paused";

#[derive(Clone, Debug, Serialize)]
pub struct TagResponse {
    pub id: i64,
    pub name: String,
    pub is_difficulty: bool,
}

impl From<&TagRow> for TagResponse {
    fn from(tag: &TagRow) -> Self {
        TagResponse {
            id: tag.id,
            name: tag.name.clone(),
            is_difficulty: tag.is_difficulty,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ProjectResponse {
    pub id: i64,
    pub name: String,
    pub paused: bool,
}

impl From<&ProjectRow> for ProjectResponse {
    fn from(project: &ProjectRow) -> Self {
        ProjectResponse {
            id: project.id,
            name: project.name.clone(),
            paused: project.paused,
        }
    }
}

#[derive(Clone, Debug, FromRow)]
pub struct ApiTokenRow {
    pub id: i64,
    pub name: String,
    pub token_hash: String,
    pub prefix: String,
    pub scope: String,
    pub created_by: Option<String>,
    pub created_at: Ts,
    pub last_used_at: Option<Ts>,
    pub expires_at: Option<Ts>,
    pub revoked_at: Option<Ts>,
}

#[derive(Clone, Debug, FromRow)]
pub struct LocalAuthRow {
    pub id: i64,
    pub username: String,
    pub password_hash: String,
    pub enabled: bool,
    pub setup_completed: bool,
    pub initial_password: Option<String>,
    pub updated_at: Ts,
}

#[derive(Clone, Debug, FromRow)]
pub struct SyncRemoteRow {
    pub id: i64,
    pub url: String,
    pub token: String,
    pub username: Option<String>,
    pub pushed_version: i64,
    pub pulled_version: i64,
    pub last_synced_at: Option<Ts>,
    pub last_changed_at: Option<Ts>,
    pub last_error: Option<String>,
    pub created_at: Ts,
    pub pinned_cert: Option<String>,
}
