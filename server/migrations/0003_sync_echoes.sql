CREATE TABLE IF NOT EXISTS sync_echoes (
	kind VARCHAR NOT NULL,
	uid VARCHAR NOT NULL,
	version INTEGER NOT NULL,
	PRIMARY KEY (kind, uid)
);

DROP TRIGGER IF EXISTS sync_notes_after_insert;
DROP TRIGGER IF EXISTS sync_notes_after_update;
DROP TRIGGER IF EXISTS sync_notes_after_delete;
DROP TRIGGER IF EXISTS sync_projects_after_insert;
DROP TRIGGER IF EXISTS sync_projects_after_update;
DROP TRIGGER IF EXISTS sync_projects_after_delete;
DROP TRIGGER IF EXISTS sync_tags_after_insert;
DROP TRIGGER IF EXISTS sync_tags_after_update;
DROP TRIGGER IF EXISTS sync_tags_after_delete;
DROP TRIGGER IF EXISTS sync_settings_after_insert;
DROP TRIGGER IF EXISTS sync_settings_after_update;
DROP TRIGGER IF EXISTS sync_reminders_after_insert;
DROP TRIGGER IF EXISTS sync_reminders_after_update;
DROP TRIGGER IF EXISTS sync_reminders_after_delete;
DROP TRIGGER IF EXISTS sync_note_tags_after_insert;
DROP TRIGGER IF EXISTS sync_note_tags_after_delete;
