import logging
import os
import sys
from pathlib import Path

from peewee import SqliteDatabase

from .models import Note, User, db_proxy

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
    project_dir = get_app_dir(PROJECT_NAME)
    project_dir.mkdir(parents=True, exist_ok=True)
    db_path = project_dir / f"{PROJECT_NAME}.db"
    return db_path


def setup_db() -> SqliteDatabase | None:
    try:
        db_path = get_sqlite_db_file_path()
        db = SqliteDatabase(
            str(db_path),
            pragmas={
                "journal_mode": "wal",
                "cache_size": -1 * 64000,  # 64MB cache
                "foreign_keys": 1,  # Enforce foreign keys
                "ignore_check_constraints": 0,
            },
        )
        db_proxy.initialize(db)
        db.connect()
        db.create_tables([User, Note], safe=True)
        log.info(f"DB initialized at {db_path}")

        return db
    except Exception as e:
        log.error(f"Error setting up db: {e}")
        return None
