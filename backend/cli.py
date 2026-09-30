import argparse
import logging
import os
import shutil
import sys
from pathlib import Path

from sqlalchemy import Engine
from sqlmodel import Session


def _open_engine() -> Engine:
    from db.setup import setup_db

    engine = setup_db()
    if engine is None:
        sys.exit("Couldn't open the database.")
    return engine


def reset_login(_args: argparse.Namespace) -> int:
    from local_auth.service import reset_local_auth

    with Session(_open_engine()) as session:
        record = reset_local_auth(session)
    print("Sign-in reset. Everyone is signed out. Sign in with")
    print(f"  username: {record.username}")
    print(f"  password: {record.initial_password}")
    print("and choose a new username and password.")
    return 0


def snapshot(_args: argparse.Namespace) -> int:
    from backups.service import create_snapshot

    taken = create_snapshot(_open_engine())
    print(f"Snapshot written to {taken.path} ({taken.size_bytes:,} bytes).")
    return 0


def restore(args: argparse.Namespace) -> int:
    from backups.service import restore_database
    from db.setup import get_sqlite_db_file_path

    source = Path(args.file).expanduser().resolve()
    target = get_sqlite_db_file_path()
    if not source.is_file():
        print(f"No such file: {source}", file=sys.stderr)
        return 1
    if source == target.resolve():
        print("That file is the live database already.", file=sys.stderr)
        return 1
    if not args.yes:
        print(f"This replaces {target} with {source}.")
        print("Stop the Notes Again server first, or the restore can be overwritten.")
        if input("Continue? [y/N] ").strip().lower() != "y":
            print("Nothing changed.")
            return 1
    try:
        moved_aside = restore_database(source, target)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1
    print(f"Restored {target} from {source}.")
    if moved_aside:
        print(f"The previous database was kept at {moved_aside}.")
    print("Start the server again.")
    return 0


def doctor(_args: argparse.Namespace) -> int:
    problems: list[str] = []

    def line(label: str, value: object) -> None:
        print(f"  {label:<18} {value}")

    print("Auth")
    try:
        import auth
    except RuntimeError as exc:
        problems.append(str(exc))
        line("mode", "error")
    else:
        line("mode", auth.AUTH_MODE)
        if auth.AUTH_MODE == "firebase" and auth.firebase_web_config() is None:
            problems.append(
                "AUTH_MODE is firebase but the VITE_FIREBASE_* web config is missing."
            )

    from backups.service import (
        backup_dir,
        display_replica_url,
        interval_hours,
        keep_count,
        list_snapshots,
    )
    from db.setup import get_sqlite_db_file_path

    print("Database")
    path = get_sqlite_db_file_path()
    line("path", path)
    line("exists", path.is_file())
    if path.is_file():
        line("size", f"{path.stat().st_size:,} bytes")
    if not os.access(path.parent, os.W_OK):
        problems.append(f"The database folder {path.parent} isn't writable.")
    if Path("/.dockerenv").exists() and not str(path).startswith("/data/"):
        problems.append(
            f"Running in a container but DB_PATH ({path}) isn't under /data."
        )

    print("Frontend")
    default_dist = (
        Path(__file__).resolve().parent.parent / "frontend" / "dist" / "client"
    )
    dist = Path(os.environ.get("FRONTEND_DIST", default_dist))
    line("folder", dist)
    if not (dist / "index.html").is_file():
        problems.append(f"No built frontend at {dist}. Run `make build-frontend`.")

    print("Backups")
    engine = _open_engine()
    hours = interval_hours()
    line("local snapshots", f"every {hours}h, keep {keep_count()}" if hours else "off")
    line("folder", backup_dir(engine))
    snapshots = list_snapshots(engine)
    line(
        "latest",
        snapshots[0].created_at.isoformat(timespec="seconds") if snapshots else "none",
    )
    offsite = display_replica_url()
    line("off-site", offsite or "not configured")
    if offsite and not shutil.which("litestream"):
        problems.append(
            "Off-site backup is configured but litestream isn't installed here. "
            "It runs inside the Docker image."
        )
    if not offsite and os.environ.get("LITESTREAM_ACCESS_KEY_ID"):
        problems.append("LITESTREAM_ACCESS_KEY_ID is set but BACKUP_REPLICA_URL isn't.")

    print()
    if problems:
        print("Problems:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("No problems found.")
    return 0


def main() -> int:
    logging.basicConfig(level=logging.WARNING, force=True)
    parser = argparse.ArgumentParser(
        prog="cli.py", description="Notes Again maintenance"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "reset-login", help="reset sign-in to a temporary admin password"
    ).set_defaults(run=reset_login)
    commands.add_parser("snapshot", help="write a local snapshot now").set_defaults(
        run=snapshot
    )
    restore_parser = commands.add_parser(
        "restore", help="replace the database with a backup file"
    )
    restore_parser.add_argument("file", help="a snapshot or downloaded .db file")
    restore_parser.add_argument(
        "-y", "--yes", action="store_true", help="don't ask to confirm"
    )
    restore_parser.set_defaults(run=restore)
    commands.add_parser(
        "doctor", help="print the effective setup and check it"
    ).set_defaults(run=doctor)
    args = parser.parse_args()
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())
