import datetime
import sqlite3
import tempfile
from pathlib import Path
from typing import cast

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import Engine, func
from sqlmodel import col, select
from starlette.background import BackgroundTask

import auth
from auth import require_session_user
from backups.service import (
    Snapshot,
    backup_dir,
    copy_database,
    create_snapshot,
    db_path,
    display_replica_url,
    interval_hours,
    keep_count,
    list_snapshots,
)
from db.models import Note
from db.setup import SessionDep

router = APIRouter(
    prefix="/system", tags=["system"], dependencies=[Depends(require_session_user)]
)


class SnapshotInfo(BaseModel):
    name: str
    created_at: datetime.datetime
    size_bytes: int


class BackupsInfo(BaseModel):
    directory: str
    interval_hours: int
    keep: int
    count: int
    latest: SnapshotInfo | None
    offsite_url: str | None


class SystemInfo(BaseModel):
    database_path: str
    database_size_bytes: int
    sqlite_version: str
    note_count: int
    in_container: bool
    auth_mode: auth.AuthMode
    backups: BackupsInfo


def _engine(request: Request) -> Engine:
    return cast(Engine, request.app.state.engine)


def _snapshot_info(snapshot: Snapshot) -> SnapshotInfo:
    return SnapshotInfo(
        name=snapshot.path.name,
        created_at=snapshot.created_at,
        size_bytes=snapshot.size_bytes,
    )


def _database_size(path: Path) -> int:
    return sum(
        candidate.stat().st_size
        for candidate in (path, Path(f"{path}-wal"))
        if candidate.is_file()
    )


@router.get("", response_model=SystemInfo)
def system_info(request: Request, session: SessionDep):
    engine = _engine(request)
    path = db_path(engine)
    snapshots = list_snapshots(engine)
    note_count = session.exec(
        select(func.count()).select_from(Note).where(col(Note.deleted_at).is_(None))
    ).one()
    return SystemInfo(
        database_path=str(path),
        database_size_bytes=_database_size(path),
        sqlite_version=sqlite3.sqlite_version,
        note_count=note_count,
        in_container=Path("/.dockerenv").exists(),
        auth_mode=auth.effective_auth_mode(session),
        backups=BackupsInfo(
            directory=str(backup_dir(engine)),
            interval_hours=interval_hours(),
            keep=keep_count(),
            count=len(snapshots),
            latest=_snapshot_info(snapshots[0]) if snapshots else None,
            offsite_url=display_replica_url(),
        ),
    )


@router.post("/snapshot", response_model=SnapshotInfo)
def snapshot_now(request: Request):
    return _snapshot_info(create_snapshot(_engine(request)))


@router.get("/database")
def download_database(request: Request):
    workdir = Path(tempfile.mkdtemp(prefix="notes-again-download-"))
    target = workdir / "notes-again.db"
    copy_database(_engine(request), target)

    def cleanup() -> None:
        target.unlink(missing_ok=True)
        workdir.rmdir()

    stamp = datetime.datetime.now(datetime.UTC).date().isoformat()
    return FileResponse(
        target,
        media_type="application/vnd.sqlite3",
        filename=f"notes-again-{stamp}.db",
        background=BackgroundTask(cleanup),
    )
