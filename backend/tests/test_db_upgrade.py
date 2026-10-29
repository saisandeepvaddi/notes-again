from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlmodel import SQLModel

from db.setup import add_missing_columns
from main import app

LEGACY_DROPS = {
    "notes": [
        "uid",
        "sync_version",
        "ease_factor",
        "interval_days",
        "algorithm",
        "fsrs_card",
        "paused_at",
        "in_review",
    ],
    "reminders": ["uid", "rating", "ease_factor", "interval_days", "fsrs_card"],
    "tags": ["uid", "sync_version", "is_difficulty", "default_ease_factor"],
    "projects": ["uid", "sync_version", "paused"],
    "settings": ["sync_version"],
}


def build_legacy_database(path) -> None:
    engine = create_engine(f"sqlite:///{path}")
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for table, columns in LEGACY_DROPS.items():
            for column in columns:
                conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
        conn.execute(
            text(
                "INSERT INTO notes (id, name, content, created_at, updated_at, user_id) "
                "VALUES (1, 'Legacy note', 'written before search existed', "
                "'2024-01-01 00:00:00', '2024-01-01 00:00:00', 1)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO reminders (note_id, remind_at, created_at, updated_at) VALUES "
                "(1, '2024-02-01 00:00:00', '2024-01-01 00:00:00', '2024-01-01 00:00:00'), "
                "(1, '2024-03-01 00:00:00', '2024-01-01 00:00:00', '2024-01-01 00:00:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO tags (name, created_at) VALUES ('Hard', '2024-01-01 00:00:00')"
            )
        )
    engine.dispose()


def test_an_old_database_is_upgraded_in_place_on_start(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy.db"
    build_legacy_database(db_path)
    monkeypatch.setenv("DB_PATH", str(db_path))

    with TestClient(app) as client:
        columns = {
            table: {c["name"] for c in inspect(app.state.engine).get_columns(table)}
            for table in LEGACY_DROPS
        }
        for table, dropped in LEGACY_DROPS.items():
            assert set(dropped) <= columns[table], table

        note = client.get("/api/notes/1").json()
        assert note["in_review"] is True
        assert [t["name"] for t in note["tags"]] == ["Medium"]
        pending = [r for r in note["reminders"] if r["reviewed_at"] is None]
        assert [r["remind_at"][:10] for r in pending] == ["2024-02-01"]

        hard = next(
            t for t in client.get("/api/tags/list").json() if t["name"] == "Hard"
        )
        assert hard["is_difficulty"] is True

        hits = client.get("/api/search", params={"q": "before search"}).json()["notes"]
        assert [hit["id"] for hit in hits] == [1]

        with app.state.engine.connect() as conn:
            note_uid, note_version = conn.execute(
                text("SELECT uid, sync_version FROM notes WHERE id = 1")
            ).one()
            reminder_uids = conn.execute(text("SELECT uid FROM reminders")).scalars().all()
            hard_uid = conn.execute(
                text("SELECT uid FROM tags WHERE name = 'Hard'")
            ).scalar_one()
        assert len(note_uid) == 32
        assert note_version > 0
        assert all(reminder_uids)
        assert hard_uid == "difficulty-hard"


def test_adding_missing_columns_twice_is_harmless(tmp_path):
    db_path = tmp_path / "legacy.db"
    build_legacy_database(db_path)
    engine = create_engine(f"sqlite:///{db_path}")

    add_missing_columns(engine)
    add_missing_columns(engine)

    names = {c["name"] for c in inspect(engine).get_columns("notes")}
    assert {"paused_at", "in_review", "algorithm"} <= names
    engine.dispose()
