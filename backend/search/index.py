from sqlalchemy import Connection, Engine, text

TABLE = "notes_fts"

_CREATE_TABLE = (
    f"CREATE VIRTUAL TABLE {TABLE} USING fts5("
    "name, content, content='notes', content_rowid='id', "
    "tokenize='trigram remove_diacritics 1')"
)

_TRIGGERS = [
    (
        "CREATE TRIGGER IF NOT EXISTS notes_fts_after_insert AFTER INSERT ON notes BEGIN "
        f"INSERT INTO {TABLE}(rowid, name, content) VALUES (new.id, new.name, new.content); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS notes_fts_after_delete AFTER DELETE ON notes BEGIN "
        f"INSERT INTO {TABLE}({TABLE}, rowid, name, content) "
        "VALUES ('delete', old.id, old.name, old.content); "
        "END"
    ),
    (
        "CREATE TRIGGER IF NOT EXISTS notes_fts_after_update "
        "AFTER UPDATE OF name, content ON notes BEGIN "
        f"INSERT INTO {TABLE}({TABLE}, rowid, name, content) "
        "VALUES ('delete', old.id, old.name, old.content); "
        f"INSERT INTO {TABLE}(rowid, name, content) VALUES (new.id, new.name, new.content); "
        "END"
    ),
]


def _table_exists(conn: Connection) -> bool:
    return (
        conn.execute(
            text("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = :name"),
            {"name": TABLE},
        ).first()
        is not None
    )


def ensure_search_index(engine: Engine) -> None:
    with engine.begin() as conn:
        created = not _table_exists(conn)
        if created:
            conn.execute(text(_CREATE_TABLE))
        for trigger in _TRIGGERS:
            conn.execute(text(trigger))
        if created:
            conn.execute(text(f"INSERT INTO {TABLE}({TABLE}) VALUES ('rebuild')"))


def rebuild_search_index(engine: Engine) -> None:
    ensure_search_index(engine)
    with engine.begin() as conn:
        conn.execute(text(f"INSERT INTO {TABLE}({TABLE}) VALUES ('rebuild')"))


def check_search_index(engine: Engine) -> str | None:
    try:
        with engine.begin() as conn:
            if not _table_exists(conn):
                return "The search index is missing. Restart the app to build it."
            conn.execute(
                text(
                    f"INSERT INTO {TABLE}({TABLE}, rank) VALUES ('integrity-check', 1)"
                )
            )
    except Exception as exc:
        return f"The search index is out of date ({exc}). Run `cli.py reindex`."
    return None
