import datetime
import hashlib

import pytest
from sqlmodel import Session, select

from db.models import ApiToken, utcnow
from tests.conftest import ME, bearer

pytestmark = pytest.mark.usefixtures("real_auth")


def mint(client, name="Extension", **body) -> dict:
    response = client.post("/api/tokens/create", json={"name": name, **body}, headers=ME)
    assert response.status_code == 200, response.text
    return response.json()


def test_requests_without_credentials_are_rejected(client):
    assert client.get("/api/projects/list").status_code == 401
    assert client.get("/api/tokens/list").status_code == 401


def test_firebase_sessions_still_work_and_bad_ones_do_not(client):
    assert client.get("/api/projects/list", headers=ME).status_code == 200
    assert client.get("/api/projects/list", headers=bearer("garbage")).status_code == 401


def test_create_returns_the_plaintext_once_and_list_never_does(client):
    created = mint(client, "Laptop")
    assert created["token"].startswith("nal_")
    assert created["prefix"] == created["token"][:10]
    assert created["scope"] == "capture"

    listed = client.get("/api/tokens/list", headers=ME).json()
    assert [t["name"] for t in listed] == ["Laptop"]
    assert "token" not in listed[0]
    assert created["token"] not in str(listed)


def test_only_a_hash_is_stored(client):
    created = mint(client)
    with Session(client.app.state.engine) as session:
        record = session.exec(select(ApiToken)).one()
    assert record.token_hash == hashlib.sha256(created["token"].encode()).hexdigest()
    assert created["token"] not in record.model_dump().values()


def test_name_is_required(client):
    response = client.post("/api/tokens/create", json={"name": "   "}, headers=ME)
    assert response.status_code == 400


def test_capture_token_can_save_a_note_end_to_end(client):
    headers = bearer(mint(client)["token"])
    assert client.get("/api/projects/list", headers=headers).status_code == 200
    assert client.get("/api/tags/list", headers=headers).status_code == 200
    project = client.post("/api/projects/create", json={"name": "Reading"}, headers=headers).json()
    tag = client.post("/api/tags/create", json={"name": "rust"}, headers=headers).json()
    note = client.post(
        "/api/notes/create",
        json={
            "name": "A post",
            "content": "https://a.dev\n\nbody",
            "project_id": project["id"],
            "tag_ids": [tag["id"]],
        },
        headers=headers,
    )
    assert note.status_code == 200, note.text
    assert note.json()["project"]["name"] == "Reading"
    assert client.get(f"/api/notes/{note.json()['id']}", headers=ME).status_code == 200


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/notes/list"),
        ("GET", "/api/notes/1"),
        ("DELETE", "/api/notes/1"),
        ("DELETE", "/api/notes/trash"),
        ("PATCH", "/api/notes/1"),
        ("GET", "/api/settings"),
        ("POST", "/api/import/notes"),
        ("DELETE", "/api/projects/1"),
        ("DELETE", "/api/tags/1"),
    ],
)
def test_capture_token_cannot_go_beyond_capturing(client, method, path):
    headers = bearer(mint(client)["token"])
    assert client.request(method, path, headers=headers).status_code == 403


def test_a_token_cannot_manage_tokens(client):
    created = mint(client)
    headers = bearer(created["token"])
    assert client.get("/api/tokens/list", headers=headers).status_code == 403
    assert client.post("/api/tokens/create", json={"name": "x"}, headers=headers).status_code == 403
    assert client.delete(f"/api/tokens/{created['id']}", headers=headers).status_code == 403


def test_token_management_stays_closed_even_if_a_scope_were_widened(client, monkeypatch):
    from tokens import service

    created = mint(client)
    widened = service.CAPTURE_ROUTES | {("GET", "/api/tokens/list"), ("POST", "/api/tokens/create")}
    monkeypatch.setitem(service.SCOPE_ROUTES, "capture", widened)

    for response in (
        client.get("/api/tokens/list", headers=bearer(created["token"])),
        client.post("/api/tokens/create", json={"name": "x"}, headers=bearer(created["token"])),
    ):
        assert response.status_code == 403
        assert response.json()["detail"] == "API tokens can't manage tokens"


def test_unknown_token_is_rejected(client):
    assert client.get("/api/projects/list", headers=bearer("nal_" + "x" * 43)).status_code == 401


def test_revoking_stops_the_token_immediately(client):
    created = mint(client)
    headers = bearer(created["token"])
    assert client.get("/api/projects/list", headers=headers).status_code == 200

    assert client.delete(f"/api/tokens/{created['id']}", headers=ME).status_code == 204

    assert client.get("/api/projects/list", headers=headers).status_code == 401
    assert client.get("/api/tokens/list", headers=ME).json() == []
    assert client.delete(f"/api/tokens/{created['id']}", headers=ME).status_code == 404


def test_expired_tokens_are_rejected(client):
    created = mint(client, expires_in_days=30)
    headers = bearer(created["token"])
    assert client.get("/api/projects/list", headers=headers).status_code == 200

    with Session(client.app.state.engine) as session:
        record = session.get(ApiToken, created["id"])
        record.expires_at = utcnow() - datetime.timedelta(minutes=1)
        session.add(record)
        session.commit()

    assert client.get("/api/projects/list", headers=headers).status_code == 401


def test_last_used_is_recorded(client):
    created = mint(client)
    assert client.get("/api/tokens/list", headers=ME).json()[0]["last_used_at"] is None
    client.get("/api/projects/list", headers=bearer(created["token"]))
    assert client.get("/api/tokens/list", headers=ME).json()[0]["last_used_at"] is not None


def test_allowlist_blocks_other_accounts(client, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", "Me@X.dev, someone@else.dev")
    assert client.get("/api/projects/list", headers=ME).status_code == 200
    assert client.get("/api/projects/list", headers=bearer("stranger-session")).status_code == 403


def test_allowlist_unset_changes_nothing(client):
    assert client.get("/api/projects/list", headers=bearer("stranger-session")).status_code == 200


def test_removing_someone_from_the_allowlist_also_kills_their_tokens(client, monkeypatch):
    monkeypatch.setenv("ALLOWED_EMAILS", "me@x.dev")
    headers = bearer(mint(client)["token"])
    assert client.get("/api/projects/list", headers=headers).status_code == 200

    monkeypatch.setenv("ALLOWED_EMAILS", "someone@else.dev")
    assert client.get("/api/projects/list", headers=headers).status_code == 401


def test_auth_mode_none_still_means_open(client, monkeypatch):
    monkeypatch.setattr("auth.AUTH_MODE", "none")
    assert client.get("/api/projects/list").status_code == 200
    assert client.get("/api/tokens/list").status_code == 200


def test_app_token_can_do_everything_but_manage_tokens(client):
    created = mint(client, "Phone", scope="app")
    assert created["scope"] == "app"
    headers = bearer(created["token"])
    note = client.post("/api/notes/create", json={"name": "n", "content": "c"}, headers=headers)
    assert note.status_code == 200, note.text
    note_id = note.json()["id"]
    assert client.get("/api/notes/due", headers=headers).status_code == 200
    assert client.get(f"/api/notes/{note_id}", headers=headers).status_code == 200
    assert (
        client.patch(
            f"/api/notes/{note_id}", json={"name": "m", "content": "d"}, headers=headers
        ).status_code
        == 200
    )
    assert client.get("/api/settings", headers=headers).status_code == 200
    assert client.delete(f"/api/notes/{note_id}", headers=headers).status_code == 204
    assert client.get("/api/tokens/list", headers=headers).status_code == 403
    assert client.get("/api/system", headers=headers).status_code == 403


def test_unknown_scope_is_rejected(client):
    response = client.post("/api/tokens/create", json={"name": "x", "scope": "root"}, headers=ME)
    assert response.status_code == 422
