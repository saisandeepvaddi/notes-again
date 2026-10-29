import asyncio
import datetime
import logging
import socket
import threading
from typing import Any, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import Engine, delete
from sqlmodel import Session, select

import auth
from db.models import Note, SyncBase, SyncConflict, SyncRemote, utcnow
from db.setup import SessionDep
from notes.schema import UTCDateTime

from .client import resolve_conflict, sync_once
from .payloads import current_version

log = logging.getLogger(__name__)

CHECK_SECONDS = 10
PULL_EVERY = datetime.timedelta(seconds=60)
REQUEST_TIMEOUT = 30.0
VERIFY_SINCE = 2**62


def require_desktop() -> None:
    if auth.AUTH_MODE != "desktop":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")


router = APIRouter(
    prefix="/sync", tags=["sync"], dependencies=[Depends(require_desktop)]
)

_running = threading.Lock()


def remote_client(url: str, token: str | None = None) -> httpx.Client:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return httpx.Client(base_url=url, headers=headers, timeout=REQUEST_TIMEOUT)


def describe_error(url: str, exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code in (401, 403):
            return "The server no longer accepts this desktop. Disconnect and connect again."
        if code == 404:
            return "The server doesn't support sync yet. Update it to the latest Notes Again."
        return f"The server answered with an error ({code})."
    if isinstance(exc, httpx.TransportError):
        return f"Couldn't reach {url}. Changes will sync when it's back."
    return str(exc) or exc.__class__.__name__


def run_sync(engine: Engine) -> None:
    with Session(engine) as session:
        remote = session.get(SyncRemote, 1)
        if remote is None:
            return
        url, token = remote.url, remote.token
    with _running:
        try:
            with remote_client(url, token) as http:
                sync_once(engine, http)
        except Exception as exc:
            log.warning("Sync with %s failed: %s", url, exc)
            with Session(engine) as session:
                remote = session.get(SyncRemote, 1)
                if remote is not None:
                    remote.last_error = describe_error(url, exc)
                    session.add(remote)
                    session.commit()


def _sync_due(engine: Engine) -> bool:
    with Session(engine) as session:
        remote = session.get(SyncRemote, 1)
        if remote is None:
            return False
        if current_version(session) > remote.pushed_version:
            return True
        last = remote.last_synced_at
        if last is None:
            return True
        if last.tzinfo is None:
            last = last.replace(tzinfo=datetime.UTC)
        return utcnow() - last >= PULL_EVERY


def sync_if_due(engine: Engine) -> None:
    if not _running.locked() and _sync_due(engine):
        run_sync(engine)


async def run_sync_schedule(engine: Engine) -> None:
    while True:
        try:
            await asyncio.to_thread(sync_if_due, engine)
        except Exception:
            log.exception("Background sync failed")
        await asyncio.sleep(CHECK_SECONDS)


def _engine(request: Request) -> Engine:
    return cast(Engine, request.app.state.engine)


def _sync_in_background(engine: Engine) -> None:
    threading.Thread(target=run_sync, args=(engine,), daemon=True).start()


class SyncStatus(BaseModel):
    connected: bool
    url: str | None = None
    username: str | None = None
    syncing: bool = False
    pending: bool = False
    conflicts: int = 0
    last_synced_at: UTCDateTime | None = None
    last_changed_at: UTCDateTime | None = None
    last_error: str | None = None


def _status(session: Session) -> SyncStatus:
    remote = session.get(SyncRemote, 1)
    if remote is None:
        return SyncStatus(connected=False)
    return SyncStatus(
        connected=True,
        url=remote.url,
        username=remote.username,
        syncing=_running.locked(),
        pending=current_version(session) > remote.pushed_version,
        conflicts=len(session.exec(select(SyncConflict.note_uid)).all()),
        last_synced_at=remote.last_synced_at,
        last_changed_at=remote.last_changed_at,
        last_error=remote.last_error,
    )


@router.get("/status", response_model=SyncStatus)
def sync_status(session: SessionDep):
    return _status(session)


class ConnectBody(BaseModel):
    url: str = Field(max_length=500)
    username: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, max_length=500)
    token: str | None = Field(default=None, max_length=500)


def _normalize_url(raw: str) -> str:
    url = raw.strip().rstrip("/")
    if url.endswith("/api"):
        url = url.removesuffix("/api")
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail)


def _exchange_password(http: httpx.Client, username: str, password: str) -> str:
    response = http.post(
        "/api/auth/token",
        json={
            "username": username,
            "password": password,
            "device_name": f"Desktop app ({socket.gethostname()})",
        },
    )
    if response.status_code == 401:
        raise _bad_request("Wrong username or password.")
    if response.status_code == 409:
        raise _bad_request(
            "This server doesn't use a username and password. Create an app token "
            "in its Settings > API tokens and paste it here."
        )
    if response.status_code == 429:
        raise _bad_request("Too many failed attempts. Try again in a few minutes.")
    response.raise_for_status()
    return response.json()["token"]


def _verify(http: httpx.Client) -> None:
    response = http.get("/api/sync/pull", params={"since": VERIFY_SINCE, "limit": 1})
    if response.status_code == 401:
        raise _bad_request("The server didn't accept that token.")
    if response.status_code == 403:
        raise _bad_request(
            "That token can only capture notes. Create an app token on the server."
        )
    if response.status_code == 404:
        raise _bad_request(
            "This server doesn't support sync yet. Update it to the latest Notes Again."
        )
    response.raise_for_status()


@router.put("/remote", response_model=SyncStatus)
def connect(body: ConnectBody, request: Request, session: SessionDep):
    if session.get(SyncRemote, 1) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Disconnect from the current server first."
        )
    url = _normalize_url(body.url)
    token = (body.token or "").strip()
    try:
        if not token:
            if not body.username or not body.password:
                raise _bad_request("Enter a username and password, or an app token.")
            with remote_client(url) as http:
                token = _exchange_password(http, body.username.strip(), body.password)
        with remote_client(url, token) as http:
            _verify(http)
    except HTTPException:
        raise
    except Exception as exc:
        raise _bad_request(describe_error(url, exc)) from exc

    session.add(
        SyncRemote(
            url=url,
            token=token,
            username=body.username.strip()
            if body.username and not body.token
            else None,
        )
    )
    session.commit()
    _sync_in_background(_engine(request))
    return _status(session)


@router.delete("/remote", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(session: SessionDep):
    remote = session.get(SyncRemote, 1)
    if remote is None:
        return
    if remote.username is not None:
        try:
            with remote_client(remote.url, remote.token) as http:
                http.delete("/api/auth/token")
        except Exception as exc:
            log.info("Couldn't revoke the sync token on %s: %s", remote.url, exc)
    session.delete(remote)
    session.exec(delete(SyncBase))  # type: ignore[call-overload]
    session.exec(delete(SyncConflict))  # type: ignore[call-overload]
    session.commit()


@router.post("/run", response_model=SyncStatus)
def run_now(request: Request, session: SessionDep):
    run_sync(_engine(request))
    session.expire_all()
    return _status(session)


class ConflictResponse(BaseModel):
    note_id: int
    name: str
    content: str
    their_name: str
    their_content: str
    detected_at: UTCDateTime


@router.get("/conflicts", response_model=list[ConflictResponse])
def list_conflicts(session: SessionDep):
    rows: list[Any] = session.exec(
        select(SyncConflict, Note).join(Note, Note.uid == SyncConflict.note_uid)
    ).all()
    return [
        ConflictResponse(
            note_id=note.id,
            name=note.name,
            content=note.content,
            their_name=conflict.their_name,
            their_content=conflict.their_content,
            detected_at=conflict.detected_at,
        )
        for conflict, note in rows
    ]


class ResolveBody(BaseModel):
    name: str
    content: str


@router.post("/conflicts/{note_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
def resolve(note_id: int, body: ResolveBody, request: Request, session: SessionDep):
    note = session.get(Note, note_id)
    engine = _engine(request)
    if note is None or not resolve_conflict(
        engine, note.uid, name=body.name, content=body.content
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No conflict for this note")
    _sync_in_background(engine)
