import os
import subprocess
import sys
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import auth
from desktop_server import READY_PREFIX
from main import app

SECRET = "launch-secret"
BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture
def desktop_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(auth, "AUTH_MODE", "desktop")
    monkeypatch.setenv("DESKTOP_SECRET", SECRET)
    monkeypatch.setenv("DB_PATH", str(tmp_path / "desktop.db"))
    with TestClient(app) as test_client:
        yield test_client


def test_desktop_mode_rejects_requests_without_the_launch_cookie(desktop_client):
    assert desktop_client.get("/api/projects/list").status_code == 401
    status = desktop_client.get("/api/auth/status").json()
    assert status["mode"] == "desktop"
    assert status["authenticated"] is False


def test_desktop_sign_in_sets_the_cookie_and_opens_the_app(desktop_client):
    response = desktop_client.get(
        "/api/auth/desktop", params={"secret": SECRET}, follow_redirects=False
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/"
    assert desktop_client.get("/api/projects/list").status_code == 200
    assert desktop_client.get("/api/auth/status").json()["authenticated"] is True


def test_desktop_sign_in_rejects_a_wrong_secret(desktop_client):
    response = desktop_client.get(
        "/api/auth/desktop", params={"secret": "guess"}, follow_redirects=False
    )
    assert response.status_code == 404
    assert desktop_client.get("/api/projects/list").status_code == 401


def test_desktop_sign_in_is_unavailable_in_other_modes(client, monkeypatch):
    monkeypatch.setenv("DESKTOP_SECRET", SECRET)
    response = client.get(
        "/api/auth/desktop", params={"secret": SECRET}, follow_redirects=False
    )
    assert response.status_code == 404


def test_desktop_server_announces_its_port_and_exits_when_stdin_closes(tmp_path):
    env = {
        **os.environ,
        "DESKTOP_SECRET": SECRET,
        "DB_PATH": str(tmp_path / "desktop.db"),
    }
    process = subprocess.Popen(
        [sys.executable, "desktop_server.py"],
        cwd=BACKEND_DIR,
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    try:
        assert process.stdout is not None
        line = process.stdout.readline()
        assert line.startswith(READY_PREFIX)
        port = int(line.removeprefix(READY_PREFIX))
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz") as health:
            assert health.status == 200
        with pytest.raises(urllib.error.HTTPError) as rejected:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/projects/list")
        assert rejected.value.code == 401

        assert process.stdin is not None
        process.stdin.close()
        assert process.wait(timeout=10) == 0
    finally:
        process.kill()
