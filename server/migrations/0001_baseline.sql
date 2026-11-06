CREATE TABLE IF NOT EXISTS users (
	id INTEGER NOT NULL,
	username VARCHAR NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	deleted_at DATETIME,
	PRIMARY KEY (id),
	UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS tags (
	id INTEGER NOT NULL,
	uid VARCHAR NOT NULL,
	sync_version INTEGER NOT NULL,
	name VARCHAR NOT NULL,
	created_at DATETIME NOT NULL,
	is_difficulty BOOLEAN NOT NULL,
	default_ease_factor FLOAT,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS projects (
	id INTEGER NOT NULL,
	uid VARCHAR NOT NULL,
	sync_version INTEGER NOT NULL,
	name VARCHAR NOT NULL,
	created_at DATETIME NOT NULL,
	deleted_at DATETIME,
	paused BOOLEAN NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS settings (
	id INTEGER NOT NULL,
	sync_version INTEGER NOT NULL,
	default_algorithm VARCHAR NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS api_tokens (
	id INTEGER NOT NULL,
	name VARCHAR NOT NULL,
	token_hash VARCHAR NOT NULL,
	prefix VARCHAR NOT NULL,
	scope VARCHAR NOT NULL,
	created_by VARCHAR,
	created_at DATETIME NOT NULL,
	last_used_at DATETIME,
	expires_at DATETIME,
	revoked_at DATETIME,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS local_auth (
	id INTEGER NOT NULL,
	username VARCHAR NOT NULL,
	password_hash VARCHAR NOT NULL,
	enabled BOOLEAN NOT NULL,
	setup_completed BOOLEAN NOT NULL,
	initial_password VARCHAR,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
	id INTEGER NOT NULL,
	token_hash VARCHAR NOT NULL,
	created_at DATETIME NOT NULL,
	last_used_at DATETIME NOT NULL,
	expires_at DATETIME NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS sync_state (
	id INTEGER NOT NULL,
	version INTEGER NOT NULL,
	applying BOOLEAN NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS sync_tombstones (
	kind VARCHAR NOT NULL,
	uid VARCHAR NOT NULL,
	version INTEGER NOT NULL,
	PRIMARY KEY (kind, uid)
);

CREATE TABLE IF NOT EXISTS sync_bases (
	kind VARCHAR NOT NULL,
	uid VARCHAR NOT NULL,
	payload VARCHAR NOT NULL,
	PRIMARY KEY (kind, uid)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
	note_uid VARCHAR NOT NULL,
	their_name VARCHAR NOT NULL,
	their_content VARCHAR NOT NULL,
	detected_at DATETIME NOT NULL,
	PRIMARY KEY (note_uid)
);

CREATE TABLE IF NOT EXISTS sync_remote (
	id INTEGER NOT NULL,
	url VARCHAR NOT NULL,
	token VARCHAR NOT NULL,
	username VARCHAR,
	pushed_version INTEGER NOT NULL,
	pulled_version INTEGER NOT NULL,
	last_synced_at DATETIME,
	last_changed_at DATETIME,
	last_error VARCHAR,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS notes (
	id INTEGER NOT NULL,
	uid VARCHAR NOT NULL,
	sync_version INTEGER NOT NULL,
	name VARCHAR NOT NULL,
	content VARCHAR NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	deleted_at DATETIME,
	paused_at DATETIME,
	in_review BOOLEAN NOT NULL,
	ease_factor FLOAT NOT NULL,
	interval_days INTEGER NOT NULL,
	algorithm VARCHAR NOT NULL,
	fsrs_card VARCHAR,
	user_id INTEGER,
	project_id INTEGER,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id),
	FOREIGN KEY(project_id) REFERENCES projects (id)
);

CREATE TABLE IF NOT EXISTS note_tags (
	note_id INTEGER NOT NULL,
	tag_id INTEGER NOT NULL,
	PRIMARY KEY (note_id, tag_id),
	FOREIGN KEY(note_id) REFERENCES notes (id),
	FOREIGN KEY(tag_id) REFERENCES tags (id)
);

CREATE TABLE IF NOT EXISTS reminders (
	id INTEGER NOT NULL,
	uid VARCHAR NOT NULL,
	remind_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	deleted_at DATETIME,
	reviewed_at DATETIME,
	rating VARCHAR,
	ease_factor FLOAT,
	interval_days INTEGER,
	fsrs_card VARCHAR,
	note_id INTEGER,
	PRIMARY KEY (id),
	FOREIGN KEY(note_id) REFERENCES notes (id)
);

DROP INDEX IF EXISTS ix_notes_content;

UPDATE notes SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
UPDATE projects SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
UPDATE tags SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
UPDATE reminders SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;

UPDATE notes SET sync_version = 1 WHERE NOT EXISTS (SELECT 1 FROM sync_state WHERE id = 1);
UPDATE projects SET sync_version = 1 WHERE NOT EXISTS (SELECT 1 FROM sync_state WHERE id = 1);
UPDATE tags SET sync_version = 1 WHERE NOT EXISTS (SELECT 1 FROM sync_state WHERE id = 1);
UPDATE settings SET sync_version = 1 WHERE NOT EXISTS (SELECT 1 FROM sync_state WHERE id = 1);
INSERT OR IGNORE INTO sync_state (id, version, applying) VALUES (1, 1, 0);
UPDATE sync_state SET applying = 0 WHERE id = 1;

