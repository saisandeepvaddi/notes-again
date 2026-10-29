import json
from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

import auth
import sync.local
from db.models import Note, SyncBase, SyncConflict
from main import app

SECRET = "launch-secret"
REMOTE = "https://notes.example.com"
TOKEN = "nat_remote"


def fake_remote(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/api/auth/token":
        if json.loads(request.content)["password"] != "right":
            return httpx.Response(401, json={"detail": "Wrong username or password"})
        return httpx.Response(200, json={"token": TOKEN})
    if request.headers.get("Authorization") != f"Bearer {TOKEN}":
        return httpx.Response(401, json={"detail": "Not authenticated"})
    if path == "/api/sync/pull":
        return httpx.Response(200, json={"version": 0, "more": False, "changes": []})
    if path == "/api/sync/push":
        results = [
            {
                "kind": change["kind"],
                "uid": change["uid"],
                "status": "ok" if change["data"] is not None else "deleted",
                "data": change["data"],
            }
            for change in json.loads(request.content)["changes"]
        ]
        return httpx.Response(200, json={"results": results})
    return httpx.Response(404)


def old_remote(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/api/auth/token":
        return httpx.Response(200, json={"token": TOKEN})
    return httpx.Response(404)


def use_remote(monkeypatch, handler) -> None:
    def client(url: str, token: str | None = None) -> httpx.Client:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return httpx.Client(
            base_url=url, headers=headers, transport=httpx.MockTransport(handler)
        )

    monkeypatch.setattr(sync.local, "remote_client", client)


@pytest.fixture
def desktop_app(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(auth, "AUTH_MODE", "desktop")
    monkeypatch.setenv("DESKTOP_SECRET", SECRET)
    monkeypatch.setenv("DB_PATH", str(tmp_path / "desktop.db"))
    use_remote(monkeypatch, fake_remote)
    with TestClient(app) as test_client:
        test_client.get("/api/auth/desktop", params={"secret": SECRET})
        yield test_client


def connect(client: TestClient, **body) -> httpx.Response:
    response = client.put(
        "/api/sync/remote", json={"url": "notes.example.com/", **body}
    )
    client.post("/api/sync/run")
    return response


def test_sync_settings_exist_only_in_the_desktop_app(client):
    assert client.get("/api/sync/status").status_code == 404


def test_a_fresh_desktop_is_not_connected(desktop_app):
    assert desktop_app.get("/api/sync/status").json()["connected"] is False


def test_connecting_with_a_password_trades_it_for_a_token_and_syncs(desktop_app):
    response = connect(desktop_app, username="me", password="right")
    assert response.status_code == 200
    assert response.json()["url"] == REMOTE

    status = desktop_app.get("/api/sync/status").json()
    assert status["connected"] is True
    assert status["username"] == "me"
    assert status["last_error"] is None
    assert status["last_synced_at"] is not None
    assert status["pending"] is False


def test_a_wrong_password_is_reported_and_nothing_is_saved(desktop_app):
    response = connect(desktop_app, username="me", password="wrong")
    assert response.status_code == 400
    assert response.json()["detail"] == "Wrong username or password."
    assert desktop_app.get("/api/sync/status").json()["connected"] is False


def test_an_older_server_without_sync_is_explained(desktop_app, monkeypatch):
    use_remote(monkeypatch, old_remote)
    response = connect(desktop_app, username="me", password="right")
    assert response.status_code == 400
    assert "doesn't support sync" in response.json()["detail"]


def test_an_unreachable_server_is_recorded_as_the_last_error(desktop_app, monkeypatch):
    connect(desktop_app, token=TOKEN)

    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    use_remote(monkeypatch, offline)
    status = desktop_app.post("/api/sync/run").json()
    assert status["last_error"].startswith(f"Couldn't reach {REMOTE}")


def test_disconnecting_forgets_the_server_and_sync_history(desktop_app):
    connect(desktop_app, token=TOKEN)
    with Session(app.state.engine) as session:
        assert session.exec(select(SyncBase)).first() is not None

    assert desktop_app.delete("/api/sync/remote").status_code == 204
    assert desktop_app.get("/api/sync/status").json()["connected"] is False
    with Session(app.state.engine) as session:
        assert session.exec(select(SyncBase)).first() is None


def test_a_conflict_is_listed_and_resolved_with_the_chosen_text(desktop_app):
    note = desktop_app.post(
        "/api/notes/create", json={"name": "Shared", "content": "Mine"}
    ).json()
    with Session(app.state.engine) as session:
        uid = session.get(Note, note["id"]).uid
        session.add(
            SyncConflict(note_uid=uid, their_name="Shared", their_content="Theirs")
        )
        session.commit()

    conflicts = desktop_app.get("/api/sync/conflicts").json()
    assert [(c["note_id"], c["content"], c["their_content"]) for c in conflicts] == [
        (note["id"], "Mine", "Theirs")
    ]

    response = desktop_app.post(
        f"/api/sync/conflicts/{note['id']}/resolve",
        json={"name": "Shared", "content": "Merged"},
    )
    assert response.status_code == 204
    assert desktop_app.get("/api/sync/conflicts").json() == []
    assert desktop_app.get(f"/api/notes/{note['id']}").json()["content"] == "Merged"
    assert (
        desktop_app.post(
            f"/api/sync/conflicts/{note['id']}/resolve",
            json={"name": "Shared", "content": "Again"},
        ).status_code
        == 404
    )
