import logging
import os
import sys
from pathlib import Path
from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy import Engine
from sqlmodel import Session, SQLModel, create_engine, select

from db.models import User

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


def create_db_and_tables(engine: Engine) -> None:
    SQLModel.metadata.create_all(engine)
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
