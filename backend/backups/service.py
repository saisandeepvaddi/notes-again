import asyncio
import datetime
import logging
import os
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import Engine

log = logging.getLogger(__name__)

SNAPSHOT_PREFIX = "notes-again-"
SNAPSHOT_SUFFIX = ".db"
CHECK_EVERY_SECONDS = 60 * 60
DEFAULT_INTERVAL_HOURS = 24
DEFAULT_KEEP = 7

_snapshot_lock = threading.Lock()


@dataclass
class Snapshot:
    path: Path
    created_at: datetime.datetime
    size_bytes: int


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        return max(0, int(raw)) if raw else default
    except ValueError:
        log.warning("%s must be a whole number; using %s", name, default)
        return default


def interval_hours() -> int:
    return _int_env("BACKUP_INTERVAL_HOURS", DEFAULT_INTERVAL_HOURS)


def keep_count() -> int:
    return max(1, _int_env("BACKUP_KEEP", DEFAULT_KEEP))


def db_path(engine: Engine) -> Path:
    return Path(engine.url.database or "")


def backup_dir(engine: Engine) -> Path:
    configured = os.environ.get("BACKUP_DIR", "").strip()
    return Path(configured) if configured else db_path(engine).parent / "backups"


def replica_url() -> str | None:
    url = os.environ.get("BACKUP_REPLICA_URL", "").strip()
    if url:
        return url
    bucket = os.environ.get("R2_BUCKET", "").strip()
    endpoint = os.environ.get("R2_ENDPOINT", "").strip()
    if bucket and endpoint and os.environ.get("LITESTREAM_ACCESS_KEY_ID", "").strip():
        path = os.environ.get("R2_PATH", "").strip().strip("/")
        host = endpoint.removeprefix("https://").removeprefix("http://")
        return f"s3://{bucket}/{path}?endpoint={host}"
    return None


def display_replica_url() -> str | None:
    url = replica_url()
    if url is None:
        return None
    parts = urlsplit(url)
    host = parts.hostname or ""
    return f"{parts.scheme}://{host}{parts.path}"


def list_snapshots(engine: Engine) -> list[Snapshot]:
    directory = backup_dir(engine)
    if not directory.is_dir():
        return []
    snapshots = []
    for path in directory.glob(f"{SNAPSHOT_PREFIX}*{SNAPSHOT_SUFFIX}"):
        stat = path.stat()
        snapshots.append(
            Snapshot(
                path=path,
                created_at=datetime.datetime.fromtimestamp(stat.st_mtime, datetime.UTC),
                size_bytes=stat.st_size,
            )
        )
    return sorted(snapshots, key=lambda snapshot: snapshot.created_at, reverse=True)


def copy_database(engine: Engine, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".partial")
    partial.unlink(missing_ok=True)
    with engine.connect() as conn:
        raw = conn.connection.dbapi_connection
        assert raw is not None
        raw.execute("VACUUM INTO ?", (str(partial),))
    partial.replace(target)


def create_snapshot(engine: Engine) -> Snapshot:
    with _snapshot_lock:
        stamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S")
        target = backup_dir(engine) / f"{SNAPSHOT_PREFIX}{stamp}{SNAPSHOT_SUFFIX}"
        copy_database(engine, target)
        prune_snapshots(engine, keep_count())
        stat = target.stat()
        return Snapshot(
            path=target,
            created_at=datetime.datetime.fromtimestamp(stat.st_mtime, datetime.UTC),
            size_bytes=stat.st_size,
        )


def prune_snapshots(engine: Engine, keep: int) -> None:
    for snapshot in list_snapshots(engine)[keep:]:
        snapshot.path.unlink(missing_ok=True)


def snapshot_due(engine: Engine, now: datetime.datetime | None = None) -> bool:
    hours = interval_hours()
    if hours == 0:
        return False
    snapshots = list_snapshots(engine)
    if not snapshots:
        return True
    now = now or datetime.datetime.now(datetime.UTC)
    return now - snapshots[0].created_at >= datetime.timedelta(hours=hours)


async def run_snapshot_schedule(engine: Engine) -> None:
    if interval_hours() == 0:
        log.info("Local snapshots are off (BACKUP_INTERVAL_HOURS=0).")
        return
    while True:
        try:
            if await asyncio.to_thread(snapshot_due, engine):
                snapshot = await asyncio.to_thread(create_snapshot, engine)
                log.info("Wrote local snapshot %s", snapshot.path)
        except Exception:
            log.exception("Local snapshot failed")
        await asyncio.sleep(CHECK_EVERY_SECONDS)


def check_database_file(path: Path) -> str | None:
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        return f"can't open it: {exc}"
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            return f"integrity check failed: {result[0] if result else 'no result'}"
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if "notes" not in tables:
            return "it isn't a Notes Again database (no notes table)"
    except sqlite3.DatabaseError as exc:
        return f"it isn't a SQLite database: {exc}"
    finally:
        conn.close()
    return None


def restore_database(source: Path, target: Path) -> Path | None:
    problem = check_database_file(source)
    if problem:
        raise ValueError(f"Not restoring {source}: {problem}")
    moved_aside = None
    if target.exists():
        stamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S")
        moved_aside = target.with_name(f"{target.name}.before-restore-{stamp}")
        target.replace(moved_aside)
    for suffix in ("-wal", "-shm"):
        Path(f"{target}{suffix}").unlink(missing_ok=True)
    partial = target.with_name(target.name + ".partial")
    source_conn = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    try:
        source_conn.execute("VACUUM INTO ?", (str(partial),))
    finally:
        source_conn.close()
    partial.replace(target)
    return moved_aside
