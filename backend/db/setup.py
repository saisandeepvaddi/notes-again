import logging
import os
import sys
from pathlib import Path
from typing import Annotated, Any, cast

from fastapi import Depends, Request
from sqlalchemy import Engine, func, inspect, text
from sqlalchemy.orm import selectinload
from sqlmodel import Session, SQLModel, col, create_engine, select

from db.models import Note, Reminder, Tag, User
from tags.difficulty import DIFFICULTY_TAGS

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

PROJECT_NAME = "note-and-learn"


def get_app_dir(app_name: str) -> Path:
    if sys.platform == "win32":
        # %LOCALAPPDATA% (typically C:\Users\<User>\AppData\Local)
        base = os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        return Path(base) / app_name
    elif sys.platform == "darwin":
        # ~/Library/Application Support/<app_name>
        return Path.home() / "Library" / "Application Support" / app_name
    else:
        # XDG data home (~/.local/share/<app_name>)
        base = os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share")
        return Path(base) / app_name


def get_sqlite_db_file_path() -> Path:
    # In a container (or anywhere with a mounted volume) set DB_PATH to point
    # at the volume, e.g. /data/note-and-learn.db. Falls back to the local
    # platform app-data dir for development.
    env_path = os.environ.get("DB_PATH")
    if env_path:
        db_path = Path(env_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return db_path

    project_dir = get_app_dir(PROJECT_NAME)
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir / f"{PROJECT_NAME}.db"


def add_missing_columns(engine: Engine) -> None:
    """Lightweight schema patcher: adds new columns to existing tables.

    There's no migration tool (Alembic) in this project. create_all() only
    creates missing tables, so columns added to models after the DB already
    exists need a manual ALTER TABLE, or existing user data would break.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    migrations: dict[str, list[tuple[str, str]]] = {
        "notes": [
            ("ease_factor", "REAL NOT NULL DEFAULT 2.5"),
            ("interval_days", "INTEGER NOT NULL DEFAULT 0"),
        ],
        "reminders": [
            ("rating", "TEXT"),
            ("ease_factor", "REAL"),
            ("interval_days", "INTEGER"),
        ],
        "tags": [
            ("is_difficulty", "BOOLEAN NOT NULL DEFAULT 0"),
            ("default_ease_factor", "REAL"),
            ("is_project", "BOOLEAN NOT NULL DEFAULT 0"),
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


def collapse_legacy_pending_reminders(engine: Engine) -> None:
    """Data cleanup for notes created under the old fixed-schedule model.

    Those notes could have several unreviewed reminders queued at once
    (0/1/3/7/14/30/60 days). The adaptive review flow assumes at most one
    pending reminder per note, so on first run after upgrading, collapse
    each note down to just its soonest pending reminder. A no-op once every
    note has gone through the new one-at-a-time review flow.
    """
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
    """Ensures the built-in Easy/Medium/Hard difficulty tags exist."""
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
    """Every note needs exactly one difficulty tag; defaults existing notes to Medium."""
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


def create_db_and_tables(engine: Engine) -> None:
    add_missing_columns(engine)
    SQLModel.metadata.create_all(engine)
    collapse_legacy_pending_reminders(engine)
    seed_difficulty_tags(engine)
    backfill_note_difficulty(engine)
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
