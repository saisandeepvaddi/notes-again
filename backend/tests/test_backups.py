import datetime
import os
import sqlite3

import pytest

from backups import service
from tests.conftest import ME, bearer


def engine_of(client):
    return client.app.state.engine


def make_note(client, name="Backed up"):
    response = client.post("/api/notes/create", json={"name": name, "content": "body"})
    assert response.status_code == 200, response.text


def note_names(path) -> list[str]:
    conn = sqlite3.connect(path)
    try:
        return [row[0] for row in conn.execute("SELECT name FROM notes ORDER BY id")]
    finally:
        conn.close()


def test_snapshot_is_a_readable_copy_next_to_the_database(client):
    make_note(client)
    snapshot = service.create_snapshot(engine_of(client))
    assert snapshot.path.parent == service.db_path(engine_of(client)).parent / "backups"
    assert snapshot.path.name.startswith("notes-again-")
    assert note_names(snapshot.path) == ["Backed up"]
    assert not list(snapshot.path.parent.glob("*.partial"))


def test_old_snapshots_are_pruned(client, monkeypatch):
    monkeypatch.setenv("BACKUP_KEEP", "2")
    engine = engine_of(client)
    folder = service.backup_dir(engine)
    folder.mkdir(parents=True)
    for day in (1, 2, 3):
        old = folder / f"notes-again-2020010{day}-000000.db"
        old.write_bytes(b"")
        stamp = datetime.datetime(2020, 1, day, tzinfo=datetime.UTC).timestamp()
        os.utime(old, (stamp, stamp))
    service.create_snapshot(engine)
    names = sorted(snapshot.path.name for snapshot in service.list_snapshots(engine))
    assert len(names) == 2
    assert "notes-again-20200103-000000.db" in names


def test_snapshot_is_due_only_after_the_interval(client, monkeypatch):
    monkeypatch.setenv("BACKUP_INTERVAL_HOURS", "24")
    engine = engine_of(client)
    assert service.snapshot_due(engine)
    taken = service.create_snapshot(engine)
    assert not service.snapshot_due(engine)
    later = taken.created_at + datetime.timedelta(hours=25)
    assert service.snapshot_due(engine, now=later)

    monkeypatch.setenv("BACKUP_INTERVAL_HOURS", "0")
    assert not service.snapshot_due(engine, now=later)


def test_restore_swaps_in_the_backup_and_keeps_the_old_file(client, tmp_path):
    make_note(client, "Before")
    backup = service.create_snapshot(engine_of(client)).path
    make_note(client, "After")

    live = tmp_path / "live.db"
    source_conn = sqlite3.connect(service.db_path(engine_of(client)))
    source_conn.execute("VACUUM INTO ?", (str(live),))
    source_conn.close()

    moved_aside = service.restore_database(backup, live)
    assert note_names(live) == ["Before"]
    assert moved_aside is not None and note_names(moved_aside) == ["Before", "After"]


@pytest.mark.parametrize("content", [b"not a database", b""])
def test_restore_refuses_files_that_are_not_notes_databases(tmp_path, content):
    bogus = tmp_path / "bogus.db"
    bogus.write_bytes(content)
    live = tmp_path / "live.db"
    live.write_bytes(b"keep me")
    with pytest.raises(ValueError, match="Not restoring"):
        service.restore_database(bogus, live)
    assert live.read_bytes() == b"keep me"


def test_replica_url_prefers_the_url_and_falls_back_to_r2_settings(monkeypatch):
    for name in ("BACKUP_REPLICA_URL", "R2_BUCKET", "R2_PATH", "R2_ENDPOINT"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv("LITESTREAM_ACCESS_KEY_ID", raising=False)
    assert service.replica_url() is None

    monkeypatch.setenv("R2_BUCKET", "bkt")
    monkeypatch.setenv("R2_PATH", "db")
    monkeypatch.setenv("R2_ENDPOINT", "https://acct.r2.cloudflarestorage.com")
    assert service.replica_url() is None
    monkeypatch.setenv("LITESTREAM_ACCESS_KEY_ID", "key")
    assert service.replica_url() == "s3://bkt/db?endpoint=acct.r2.cloudflarestorage.com"
    assert service.display_replica_url() == "s3://bkt/db"

    monkeypatch.setenv("BACKUP_REPLICA_URL", "sftp://host/backups/notes")
    assert service.replica_url() == "sftp://host/backups/notes"


def test_system_info_reports_the_database_and_backups(client):
    make_note(client)
    info = client.get("/api/system").json()
    assert info["database_path"] == str(service.db_path(engine_of(client)))
    assert info["database_size_bytes"] > 0
    assert info["note_count"] == 1
    assert info["auth_mode"] == "none"
    assert info["backups"]["latest"] is None

    taken = client.post("/api/system/snapshot").json()
    info = client.get("/api/system").json()
    assert info["backups"]["count"] == 1
    assert info["backups"]["latest"]["name"] == taken["name"]


def test_download_is_a_consistent_database_copy(client, tmp_path):
    make_note(client, "Downloaded")
    response = client.get("/api/system/database")
    assert response.status_code == 200
    assert "notes-again-" in response.headers["content-disposition"]
    copy = tmp_path / "download.db"
    copy.write_bytes(response.content)
    assert note_names(copy) == ["Downloaded"]


@pytest.mark.usefixtures("real_auth")
def test_api_tokens_cannot_reach_system_endpoints(client):
    created = client.post("/api/tokens/create", json={"name": "Ext"}, headers=ME).json()
    headers = bearer(created["token"])
    assert client.get("/api/system", headers=headers).status_code == 403
    assert client.get("/api/system/database", headers=headers).status_code == 403
    assert client.get("/api/system", headers=ME).status_code == 200
