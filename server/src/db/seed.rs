use sqlx::AssertSqlSafe;

use super::Pool;
use crate::difficulty::DIFFICULTY_TAGS;
use crate::params::id_list;
use crate::time::Ts;

async fn collapse_legacy_pending_reminders(pool: &Pool) -> Result<(), sqlx::Error> {
    let notes: Vec<Option<i64>> = sqlx::query_scalar(
        "SELECT note_id FROM reminders WHERE reviewed_at IS NULL AND deleted_at IS NULL \
         GROUP BY note_id HAVING count(*) > 1",
    )
    .fetch_all(pool)
    .await?;
    for note_id in notes {
        let pending: Vec<i64> = sqlx::query_scalar(
            "SELECT id FROM reminders WHERE note_id IS ? AND reviewed_at IS NULL AND deleted_at IS NULL \
             ORDER BY remind_at ASC",
        )
        .bind(note_id)
        .fetch_all(pool)
        .await?;
        if pending.len() > 1 {
            sqlx::query(AssertSqlSafe(format!(
                "DELETE FROM reminders WHERE id IN ({})",
                id_list(&pending[1..])
            )))
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}

async fn seed_difficulty_tags(pool: &Pool) -> Result<(), sqlx::Error> {
    for defaults in &DIFFICULTY_TAGS {
        let uid = defaults.key.uid();
        let existing: Option<(i64, bool, String)> =
            sqlx::query_as("SELECT id, is_difficulty, uid FROM tags WHERE name = ?")
                .bind(defaults.name)
                .fetch_optional(pool)
                .await?;
        match existing {
            None => {
                sqlx::query(
                    "INSERT INTO tags (uid, sync_version, name, created_at, is_difficulty, default_ease_factor) \
                     VALUES (?, 0, ?, ?, 1, ?)",
                )
                .bind(&uid)
                .bind(defaults.name)
                .bind(Ts::now())
                .bind(defaults.default_ease_factor)
                .execute(pool)
                .await?;
            }
            Some((id, is_difficulty, current_uid)) => {
                if !is_difficulty {
                    sqlx::query(
                        "UPDATE tags SET is_difficulty = 1, default_ease_factor = ? WHERE id = ?",
                    )
                    .bind(defaults.default_ease_factor)
                    .bind(id)
                    .execute(pool)
                    .await?;
                }
                if current_uid != uid {
                    sqlx::query("UPDATE tags SET uid = ? WHERE id = ?")
                        .bind(&uid)
                        .bind(id)
                        .execute(pool)
                        .await?;
                }
            }
        }
    }
    Ok(())
}

async fn backfill_note_difficulty(pool: &Pool) -> Result<(), sqlx::Error> {
    let medium: i64 = sqlx::query_scalar("SELECT id FROM tags WHERE name = 'Medium'")
        .fetch_one(pool)
        .await?;
    sqlx::query(
        "INSERT INTO note_tags (note_id, tag_id) SELECT notes.id, ? FROM notes \
         WHERE notes.deleted_at IS NULL AND NOT EXISTS (\
           SELECT 1 FROM note_tags JOIN tags ON tags.id = note_tags.tag_id \
           WHERE note_tags.note_id = notes.id AND tags.is_difficulty = 1)",
    )
    .bind(medium)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_settings(pool: &Pool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO settings (id, sync_version, default_algorithm) SELECT 1, 0, 'fsrs' \
         WHERE NOT EXISTS (SELECT 1 FROM settings WHERE id = 1)",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_default_user(pool: &Pool) -> Result<(), sqlx::Error> {
    let now = Ts::now();
    sqlx::query(
        "INSERT INTO users (username, created_at, updated_at) SELECT 'default', ?, ? \
         WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'default')",
    )
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn run(pool: &Pool) -> Result<(), sqlx::Error> {
    collapse_legacy_pending_reminders(pool).await?;
    seed_difficulty_tags(pool).await?;
    backfill_note_difficulty(pool).await?;
    seed_settings(pool).await?;
    seed_default_user(pool).await?;
    Ok(())
}
