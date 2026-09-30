import pytest
from sqlmodel import Session

from db.models import LocalAuth
from local_auth import service
from local_auth.passwords import hash_password, verify_password
from local_auth.service import SESSION_COOKIE
from tests.conftest import bearer


@pytest.fixture(autouse=True)
def _clear_login_throttle():
    service._failed_logins.clear()
    yield
    service._failed_logins.clear()


def initial_password(client) -> str:
    with Session(client.app.state.engine) as session:
        record = session.get(LocalAuth, 1)
        assert record is not None and record.initial_password
        return record.initial_password


def login(client, username="admin", password=None):
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password or initial_password(client)},
    )


def test_password_hashes_verify_and_reject():
    stored = hash_password("correct horse")
    assert verify_password("correct horse", stored)
    assert not verify_password("wrong horse", stored)
    assert not verify_password("anything", "not-a-hash")


def test_first_launch_requires_sign_in_with_the_generated_password(local_client):
    status = local_client.get("/api/auth/status").json()
    assert status["mode"] == "local"
    assert status["authenticated"] is False
    assert status["setup_required"] is True
    assert local_client.get("/api/projects/list").status_code == 401

    assert login(local_client, password="admin").status_code == 401
    assert login(local_client).status_code == 204
    assert SESSION_COOKIE in local_client.cookies

    status = local_client.get("/api/auth/status").json()
    assert status["authenticated"] is True
    assert status["username"] == "admin"
    assert local_client.get("/api/projects/list").status_code == 200


def test_setup_replaces_the_default_credentials(local_client):
    old_password = initial_password(local_client)
    login(local_client)
    response = local_client.put(
        "/api/auth/local",
        json={"enabled": True, "username": "sai", "password": "a much better one"},
    )
    assert response.status_code == 204

    status = local_client.get("/api/auth/status").json()
    assert status["setup_required"] is False
    assert status["username"] == "sai"
    with Session(local_client.app.state.engine) as session:
        assert session.get(LocalAuth, 1).initial_password is None

    local_client.post("/api/auth/logout")
    assert local_client.get("/api/projects/list").status_code == 401
    assert login(local_client, "admin", old_password).status_code == 401
    assert login(local_client, "sai", "a much better one").status_code == 204


def test_setup_rejects_short_passwords(local_client):
    login(local_client)
    response = local_client.put(
        "/api/auth/local",
        json={"enabled": True, "username": "sai", "password": "short"},
    )
    assert response.status_code == 400


def test_setup_needs_a_session(local_client):
    response = local_client.put(
        "/api/auth/local",
        json={"enabled": True, "username": "x", "password": "long enough"},
    )
    assert response.status_code == 401


def test_later_changes_need_the_current_password(local_client):
    login(local_client)
    local_client.put(
        "/api/auth/local",
        json={"enabled": True, "username": "sai", "password": "first password"},
    )
    body = {"enabled": True, "username": "sai", "password": "second password"}
    assert local_client.put("/api/auth/local", json=body).status_code == 403
    body["current_password"] = "first password"
    assert local_client.put("/api/auth/local", json=body).status_code == 204


def test_turning_login_off_opens_the_app_and_can_be_turned_back_on(local_client):
    login(local_client)
    assert (
        local_client.put("/api/auth/local", json={"enabled": False}).status_code == 204
    )
    local_client.cookies.clear()

    status = local_client.get("/api/auth/status").json()
    assert status["mode"] == "none"
    assert status["configured_mode"] == "local"
    assert local_client.get("/api/projects/list").status_code == 200

    response = local_client.put(
        "/api/auth/local",
        json={"enabled": True, "username": "sai", "password": "back on again"},
    )
    assert response.status_code == 204
    local_client.cookies.clear()
    assert local_client.get("/api/projects/list").status_code == 401


def test_repeated_failures_are_throttled(local_client):
    for _ in range(service.MAX_FAILED_LOGINS):
        assert login(local_client, password="nope nope").status_code == 401
    assert login(local_client).status_code == 429


def test_api_tokens_work_in_local_mode(local_client):
    login(local_client)
    created = local_client.post("/api/tokens/create", json={"name": "Extension"}).json()
    local_client.cookies.clear()
    headers = bearer(created["token"])
    assert local_client.get("/api/projects/list", headers=headers).status_code == 200
    assert local_client.get("/api/tokens/list", headers=headers).status_code == 403


def test_forged_session_cookie_is_rejected(local_client):
    local_client.cookies.set(SESSION_COOKIE, "made-up")
    assert local_client.get("/api/projects/list").status_code == 401


def test_admin_password_env_skips_first_launch_setup(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    import auth
    from main import app

    monkeypatch.setattr(auth, "AUTH_MODE", "local")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "env.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "owner")
    monkeypatch.setenv("ADMIN_PASSWORD", "from the environment")
    with TestClient(app) as client:
        assert client.get("/api/auth/status").json()["setup_required"] is False
        assert login(client, "owner", "from the environment").status_code == 204


def test_login_is_refused_outside_local_mode(client):
    assert (
        client.post(
            "/api/auth/login", json={"username": "a", "password": "b"}
        ).status_code
        == 409
    )
    assert client.get("/api/auth/status").json()["mode"] == "none"


def test_firebase_status_carries_the_web_config(client, real_auth, monkeypatch):
    monkeypatch.setenv("VITE_FIREBASE_API_KEY", "key")
    monkeypatch.setenv("VITE_FIREBASE_AUTH_DOMAIN", "x.firebaseapp.com")
    monkeypatch.setenv("VITE_FIREBASE_PROJECT_ID", "x")
    status = client.get("/api/auth/status").json()
    assert status["mode"] == "firebase"
    assert status["firebase"] == {
        "apiKey": "key",
        "authDomain": "x.firebaseapp.com",
        "projectId": "x",
    }


@pytest.mark.parametrize(
    ("env", "expected"),
    [
        ({}, "local"),
        ({"FIREBASE_CREDENTIALS_FILE": "/run/secrets/firebase.json"}, "local"),
        ({"AUTH_DISABLED": "1"}, "none"),
        ({"AUTH_MODE": "firebase"}, "firebase"),
        ({"AUTH_MODE": "NONE"}, "none"),
    ],
)
def test_auth_mode_resolution(monkeypatch, env, expected):
    import auth

    for name in ("AUTH_MODE", "AUTH_DISABLED", "FIREBASE_CREDENTIALS_FILE"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    assert auth._resolve_auth_mode() == expected


def test_unknown_auth_mode_is_rejected(monkeypatch):
    import auth

    monkeypatch.setenv("AUTH_MODE", "ldap")
    with pytest.raises(RuntimeError, match="AUTH_MODE must be one of"):
        auth._resolve_auth_mode()
