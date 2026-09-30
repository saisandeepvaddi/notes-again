import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

os.environ["AUTH_DISABLED"] = "1"
os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="nal-tests-")) / "import.db")
os.environ.pop("ALLOWED_EMAILS", None)

from fastapi.testclient import TestClient

import auth
from main import app

FIREBASE_SESSIONS = {
    "me-session": {"email": "me@x.dev", "uid": "u1"},
    "stranger-session": {"email": "stranger@x.dev", "uid": "u2"},
}


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def real_auth(monkeypatch) -> None:
    def fake_verify(token: str) -> dict:
        if token not in FIREBASE_SESSIONS:
            raise ValueError("not a valid Firebase token")
        return dict(FIREBASE_SESSIONS[token])

    monkeypatch.setattr(auth, "AUTH_MODE", "firebase")
    monkeypatch.setattr(auth.firebase_auth, "verify_id_token", fake_verify)


@pytest.fixture
def local_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(auth, "AUTH_MODE", "local")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as test_client:
        yield test_client


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


ME = bearer("me-session")
