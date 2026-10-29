from sqlalchemy import Engine, text

VERSIONED_TABLES = {"note": "notes", "project": "projects", "tag": "tags"}
UID_TABLES = ("notes", "projects", "tags", "reminders")

_NOT_APPLYING = "(SELECT applying FROM sync_state WHERE id = 1) = 0"
_BUMP = "UPDATE sync_state SET version = version + 1 WHERE id = 1;"
_CURRENT = "(SELECT version FROM sync_state WHERE id = 1)"


def _stamp(table: str, id_expr: str) -> str:
    return f"UPDATE {table} SET sync_version = {_CURRENT} WHERE id = {id_expr};"


def _trigger(table: str, event: str, body: str, *, own_version: bool = False) -> str:
    when = _NOT_APPLYING
    if own_version:
        when += " AND new.sync_version IS old.sync_version"
    name = f"sync_{table}_after_{event.lower()}"
    return (
        f"CREATE TRIGGER IF NOT EXISTS {name} AFTER {event} ON {table} "
        f"WHEN {when} BEGIN {_BUMP} {body} END"
    )


def _triggers() -> list[str]:
    triggers = []
    for kind, table in VERSIONED_TABLES.items():
        clear_tombstone = (
            f"DELETE FROM sync_tombstones WHERE kind = '{kind}' AND uid = new.uid;"
        )
        add_tombstone = (
            "INSERT OR REPLACE INTO sync_tombstones (kind, uid, version) "
            f"VALUES ('{kind}', old.uid, {_CURRENT});"
        )
        triggers += [
            _trigger(table, "INSERT", f"{_stamp(table, 'new.id')} {clear_tombstone}"),
            _trigger(table, "UPDATE", _stamp(table, "new.id"), own_version=True),
            _trigger(table, "DELETE", add_tombstone),
        ]
    triggers += [
        _trigger("settings", "INSERT", _stamp("settings", "new.id")),
        _trigger("settings", "UPDATE", _stamp("settings", "new.id"), own_version=True),
        _trigger("reminders", "INSERT", _stamp("notes", "new.note_id")),
        _trigger("reminders", "UPDATE", _stamp("notes", "new.note_id")),
        _trigger("reminders", "DELETE", _stamp("notes", "old.note_id")),
        _trigger("note_tags", "INSERT", _stamp("notes", "new.note_id")),
        _trigger("note_tags", "DELETE", _stamp("notes", "old.note_id")),
    ]
    return triggers


def ensure_sync_tracking(engine: Engine) -> None:
    with engine.begin() as conn:
        for table in UID_TABLES:
            conn.execute(
                text(
                    f"UPDATE {table} SET uid = lower(hex(randomblob(16))) "
                    "WHERE uid IS NULL"
                )
            )
            conn.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{table}_uid ON {table} (uid)"
                )
            )
        for table in (*VERSIONED_TABLES.values(), "settings"):
            conn.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_{table}_sync_version "
                    f"ON {table} (sync_version)"
                )
            )
        fresh = (
            conn.execute(text("SELECT 1 FROM sync_state WHERE id = 1")).first() is None
        )
        if fresh:
            conn.execute(
                text("INSERT INTO sync_state (id, version, applying) VALUES (1, 1, 0)")
            )
            for table in (*VERSIONED_TABLES.values(), "settings"):
                conn.execute(text(f"UPDATE {table} SET sync_version = 1"))
        conn.execute(text("UPDATE sync_state SET applying = 0 WHERE id = 1"))
        for trigger in _triggers():
            conn.execute(text(trigger))
