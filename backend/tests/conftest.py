import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# auth.py reads these at import time, so they must be set before `main` loads.
# AUTH_DISABLED=1 lets it import without Firebase credentials; the `real_auth`
# fixture below turns enforcement back on for the tests that need it.
os.environ["AUTH_DISABLED"] = "1"
os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="nal-tests-")) / "import.db")
os.environ.pop("ALLOWED_EMAILS", None)

from fastapi.testclient import TestClient

import auth
from main import app

# Stand-ins for Firebase ID tokens: what verify_id_token would return.
FIREBASE_SESSIONS = {
    "me-session": {"email": "me@x.dev", "uid": "u1"},
    "stranger-session": {"email": "stranger@x.dev", "uid": "u2"},
}


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    """A client on a fresh database, with auth bypassed (the dev default)."""
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def real_auth(monkeypatch) -> None:
    """Turns on real auth checks, with Firebase verification stubbed."""

    def fake_verify(token: str) -> dict:
        if token not in FIREBASE_SESSIONS:
            raise ValueError("not a valid Firebase token")
        return dict(FIREBASE_SESSIONS[token])

    monkeypatch.setattr(auth, "AUTH_DISABLED", False)
    monkeypatch.setattr(auth.firebase_auth, "verify_id_token", fake_verify)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


ME = bearer("me-session")
