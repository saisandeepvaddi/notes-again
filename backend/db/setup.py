import logging
import os
import sys
from pathlib import Path
from typing import Annotated, Any, cast

from fastapi import Depends, Request
from sqlalchemy import Engine, func, inspect, text
from sqlalchemy.orm import selectinload
from sqlmodel import Session, SQLModel, col, create_engine, select

from db.models import Note, Reminder, Settings, Tag, User
from tags.difficulty import DIFFICULTY_TAGS

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

PROJECT_NAME = "note-and-learn"


def get_app_dir(app_name: str) -> Path:
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return Path(base) / app_name
    elif sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / app_name
    else:
        base = os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share")
        return Path(base) / app_name


def get_sqlite_db_file_path() -> Path:
    env_path = os.environ.get("DB_PATH")
    if env_path:
        db_path = Path(env_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return db_path

    project_dir = get_app_dir(PROJECT_NAME)
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir / f"{PROJECT_NAME}.db"


def add_missing_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    migrations: dict[str, list[tuple[str, str]]] = {
        "notes": [
            ("ease_factor", "REAL NOT NULL DEFAULT 2.5"),
            ("interval_days", "INTEGER NOT NULL DEFAULT 0"),
            ("project_id", "INTEGER"),
            ("algorithm", "TEXT NOT NULL DEFAULT 'sm2'"),
            ("fsrs_card", "TEXT"),
            ("paused_at", "DATETIME"),
        ],
        "projects": [
            ("paused", "BOOLEAN NOT NULL DEFAULT 0"),
        ],
        "reminders": [
            ("rating", "TEXT"),
            ("ease_factor", "REAL"),
            ("interval_days", "INTEGER"),
            ("fsrs_card", "TEXT"),
        ],
        "tags": [
            ("is_difficulty", "BOOLEAN NOT NULL DEFAULT 0"),
            ("default_ease_factor", "REAL"),
        ],
    }
    with engine.begin() as conn:
        for table, columns in migrations.items():
            if table not in existing_tables:
                continue
            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl_type in columns:
                if name not in existing_columns:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))


def ensure_indexes(engine: Engine) -> None:
    statements = [
        (
            "CREATE INDEX IF NOT EXISTS ix_reminders_note_pending "
            "ON reminders (note_id, reviewed_at, deleted_at, remind_at)"
        ),
        "CREATE INDEX IF NOT EXISTS ix_notes_deleted_project ON notes (deleted_at, project_id)",
        "CREATE INDEX IF NOT EXISTS ix_note_tags_tag_id ON note_tags (tag_id)",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def collapse_legacy_pending_reminders(engine: Engine) -> None:
    with Session(engine) as session:
        note_ids_with_multiple = session.exec(
            select(Reminder.note_id)
            .where(
                col(Reminder.reviewed_at).is_(None),
                col(Reminder.deleted_at).is_(None),
            )
            .group_by(col(Reminder.note_id))
            .having(func.count() > 1)
        ).all()
        for note_id in note_ids_with_multiple:
            pending = session.exec(
                select(Reminder)
                .where(
                    col(Reminder.note_id) == note_id,
                    col(Reminder.reviewed_at).is_(None),
                    col(Reminder.deleted_at).is_(None),
                )
                .order_by(col(Reminder.remind_at).asc())
            ).all()
            for extra in pending[1:]:
                session.delete(extra)
        session.commit()


def seed_difficulty_tags(engine: Engine) -> None:
    with Session(engine) as session:
        for defaults in DIFFICULTY_TAGS.values():
            tag = session.exec(select(Tag).where(Tag.name == defaults.name)).one_or_none()
            if tag is None:
                session.add(
                    Tag(
                        name=defaults.name,
                        is_difficulty=True,
                        default_ease_factor=defaults.default_ease_factor,
                    )
                )
            elif not tag.is_difficulty:
                tag.is_difficulty = True
                tag.default_ease_factor = defaults.default_ease_factor
                session.add(tag)
        session.commit()


def backfill_note_difficulty(engine: Engine) -> None:
    with Session(engine) as session:
        medium = session.exec(
            select(Tag).where(Tag.name == DIFFICULTY_TAGS["medium"].name)
        ).one()
        difficulty_tag_ids = {
            tag.id
            for tag in session.exec(select(Tag).where(col(Tag.is_difficulty).is_(True))).all()
        }
        notes = session.exec(
            select(Note)
            .where(col(Note.deleted_at).is_(None))
            .options(selectinload(cast(Any, Note.tags)))
        ).all()
        for note in notes:
            if not any(tag.id in difficulty_tag_ids for tag in note.tags):
                note.tags.append(medium)
                session.add(note)
        session.commit()


def seed_settings(engine: Engine) -> None:
    with Session(engine) as session:
        if session.get(Settings, 1) is None:
            session.add(Settings(id=1, default_algorithm="fsrs"))
            session.commit()


def create_db_and_tables(engine: Engine) -> None:
    add_missing_columns(engine)
    SQLModel.metadata.create_all(engine)
    ensure_indexes(engine)
    collapse_legacy_pending_reminders(engine)
    seed_difficulty_tags(engine)
    backfill_note_difficulty(engine)
    seed_settings(engine)
    with Session(engine) as session:
        default_user = session.exec(
            select(User).where(User.username == "default")
        ).first()
        if not default_user:
            default_user = User(username="default")
            session.add(default_user)
            session.commit()


def get_session(request: Request):
    engine = cast(Engine, request.app.state.engine)
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def setup_db() -> Engine | None:
    try:
        db_path = get_sqlite_db_file_path()

        connect_args = {"check_same_thread": False}
        sqlite_path = f"sqlite:///{db_path}"
        log.info(f"Database {sqlite_path=}")
        engine = create_engine(url=sqlite_path, connect_args=connect_args)
        create_db_and_tables(engine=engine)
        log.info("DB setup completed")
        return engine

    except Exception as e:
        log.error(f"Error setting up db: {e}")
        return
