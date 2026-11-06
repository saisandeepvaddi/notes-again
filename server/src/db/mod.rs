pub mod models;
mod seed;

use std::path::Path;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{AssertSqlSafe, Row};

pub type Db = sqlx::Sqlite;
pub type Pool = sqlx::SqlitePool;
pub type Conn = sqlx::SqliteConnection;
pub type Tx = sqlx::Transaction<'static, Db>;

pub const BEGIN_WRITE: &str = "BEGIN IMMEDIATE";

const LEGACY_COLUMNS: &[(&str, &[(&str, &str)])] = &[
    (
        "notes",
        &[
            ("uid", "TEXT"),
            ("sync_version", "INTEGER NOT NULL DEFAULT 0"),
            ("ease_factor", "REAL NOT NULL DEFAULT 2.5"),
            ("interval_days", "INTEGER NOT NULL DEFAULT 0"),
            ("project_id", "INTEGER"),
            ("algorithm", "TEXT NOT NULL DEFAULT 'sm2'"),
            ("fsrs_card", "TEXT"),
            ("paused_at", "DATETIME"),
            ("in_review", "BOOLEAN NOT NULL DEFAULT 1"),
        ],
    ),
    (
        "projects",
        &[
            ("paused", "BOOLEAN NOT NULL DEFAULT 0"),
            ("uid", "TEXT"),
            ("sync_version", "INTEGER NOT NULL DEFAULT 0"),
        ],
    ),
    (
        "reminders",
        &[
            ("uid", "TEXT"),
            ("rating", "TEXT"),
            ("ease_factor", "REAL"),
            ("interval_days", "INTEGER"),
            ("fsrs_card", "TEXT"),
        ],
    ),
    (
        "tags",
        &[
            ("is_difficulty", "BOOLEAN NOT NULL DEFAULT 0"),
            ("default_ease_factor", "REAL"),
            ("uid", "TEXT"),
            ("sync_version", "INTEGER NOT NULL DEFAULT 0"),
        ],
    ),
    (
        "settings",
        &[("sync_version", "INTEGER NOT NULL DEFAULT 0")],
    ),
];

pub fn connect_options(path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(false)
        .busy_timeout(Duration::from_secs(15))
}

pub async fn open(path: &Path) -> Result<Pool, sqlx::Error> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(sqlx::Error::Io)?;
    }
    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .min_connections(1)
        .connect_with(connect_options(path))
        .await?;
    setup(&pool).await?;
    Ok(pool)
}

async fn add_missing_columns(pool: &Pool) -> Result<(), sqlx::Error> {
    let mut conn = pool.acquire().await?;
    for (table, columns) in LEGACY_COLUMNS {
        let exists: Option<i64> =
            sqlx::query_scalar("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
                .bind(table)
                .fetch_optional(&mut *conn)
                .await?;
        if exists.is_none() {
            continue;
        }
        let rows = sqlx::query(AssertSqlSafe(format!("PRAGMA table_info({table})")))
            .fetch_all(&mut *conn)
            .await?;
        let existing: Vec<String> = rows
            .iter()
            .map(|row| row.get::<String, _>("name"))
            .collect();
        for (name, ddl) in *columns {
            if !existing.iter().any(|c| c == name) {
                sqlx::query(AssertSqlSafe(format!(
                    "ALTER TABLE {table} ADD COLUMN {name} {ddl}"
                )))
                .execute(&mut *conn)
                .await?;
            }
        }
    }
    Ok(())
}

pub async fn setup(pool: &Pool) -> Result<(), sqlx::Error> {
    add_missing_columns(pool).await?;
    let mut migrator = sqlx::migrate!("./migrations");
    migrator.set_ignore_missing(true);
    migrator
        .run(pool)
        .await
        .map_err(|e| sqlx::Error::Migrate(Box::new(e)))?;
    ensure_search_index(pool).await?;
    sqlx::raw_sql(include_str!("ensure.sql"))
        .execute(pool)
        .await?;
    sqlx::query("UPDATE sync_state SET applying = 0 WHERE id = 1")
        .execute(pool)
        .await?;
    seed::run(pool).await?;
    Ok(())
}

pub async fn ensure_search_index(pool: &Pool) -> Result<(), sqlx::Error> {
    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'",
    )
    .fetch_optional(pool)
    .await?;
    if exists.is_none() {
        sqlx::raw_sql(include_str!("search_table.sql"))
            .execute(pool)
            .await?;
        rebuild_search_index(pool).await?;
    }
    Ok(())
}

pub async fn rebuild_search_index(pool: &Pool) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')")
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn sqlite_version(pool: &Pool) -> Result<String, sqlx::Error> {
    sqlx::query_scalar("SELECT sqlite_version()")
        .fetch_one(pool)
        .await
}
