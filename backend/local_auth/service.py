import datetime
import hashlib
import logging
import os
import secrets
import time

from sqlalchemy import Engine, delete
from sqlmodel import Session, col, select

from db.models import AuthSession, LocalAuth, utcnow

from .passwords import generate_password, hash_password, verify_password

log = logging.getLogger(__name__)

DEFAULT_USERNAME = "admin"
SESSION_COOKIE = "notes_again_session"
SESSION_IDLE_LIFETIME = datetime.timedelta(days=30)
SESSION_REFRESH_AFTER = datetime.timedelta(hours=1)
COOKIE_MAX_AGE = int(datetime.timedelta(days=400).total_seconds())

MAX_FAILED_LOGINS = 5
FAILED_LOGIN_WINDOW_SECONDS = 15 * 60

_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
_failed_logins: dict[str, list[float]] = {}


def _aware(dt: datetime.datetime) -> datetime.datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=datetime.UTC)


def _hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_local_auth(session: Session) -> LocalAuth | None:
    return session.get(LocalAuth, 1)


def _print_first_launch_banner(record: LocalAuth) -> None:
    line = "=" * 64
    log.warning(
        "\n%s\nNotes Again: first launch. Sign in with\n  username: %s\n  password: %s\n"
        "You'll be asked to change these, or turn login off, after signing in.\n%s",
        line,
        record.username,
        record.initial_password,
        line,
    )


def ensure_local_auth(engine: Engine) -> None:
    with Session(engine) as session:
        record = get_local_auth(session)
        if record is None:
            username = os.environ.get("ADMIN_USERNAME", "").strip() or DEFAULT_USERNAME
            password = os.environ.get("ADMIN_PASSWORD", "")
            if password:
                record = LocalAuth(
                    username=username,
                    password_hash=hash_password(password),
                    setup_completed=True,
                )
            else:
                initial = generate_password()
                record = LocalAuth(
                    username=username,
                    password_hash=hash_password(initial),
                    initial_password=initial,
                )
            session.add(record)
            session.commit()
            session.refresh(record)
        if not record.setup_completed and record.initial_password:
            _print_first_launch_banner(record)


def reset_local_auth(session: Session) -> LocalAuth:
    initial = generate_password()
    record = get_local_auth(session) or LocalAuth(
        username=DEFAULT_USERNAME, password_hash=""
    )
    record.username = DEFAULT_USERNAME
    record.password_hash = hash_password(initial)
    record.initial_password = initial
    record.enabled = True
    record.setup_completed = False
    record.updated_at = utcnow()
    session.add(record)
    session.exec(delete(AuthSession))  # type: ignore[call-overload]
    session.commit()
    session.refresh(record)
    return record


def login_blocked(client_key: str) -> bool:
    now = time.monotonic()
    recent = [
        t
        for t in _failed_logins.get(client_key, [])
        if now - t < FAILED_LOGIN_WINDOW_SECONDS
    ]
    _failed_logins[client_key] = recent
    return len(recent) >= MAX_FAILED_LOGINS


def record_failed_login(client_key: str) -> None:
    _failed_logins.setdefault(client_key, []).append(time.monotonic())


def clear_failed_logins(client_key: str) -> None:
    _failed_logins.pop(client_key, None)


def check_credentials(record: LocalAuth | None, username: str, password: str) -> bool:
    if record is None or not secrets.compare_digest(
        username.strip().lower(), record.username.lower()
    ):
        verify_password(password, _DUMMY_HASH)
        return False
    return verify_password(password, record.password_hash)


def create_session(session: Session) -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        AuthSession(
            token_hash=_hash_session_token(token),
            expires_at=utcnow() + SESSION_IDLE_LIFETIME,
        )
    )
    session.commit()
    return token


def find_session(session: Session, token: str) -> AuthSession | None:
    record = session.exec(
        select(AuthSession).where(AuthSession.token_hash == _hash_session_token(token))
    ).one_or_none()
    if record is None:
        return None
    now = utcnow()
    if _aware(record.expires_at) <= now:
        session.delete(record)
        session.commit()
        return None
    if now - _aware(record.last_used_at) > SESSION_REFRESH_AFTER:
        record.last_used_at = now
        record.expires_at = now + SESSION_IDLE_LIFETIME
        session.add(record)
        session.commit()
    return record


def revoke_session(session: Session, token: str) -> None:
    session.exec(  # type: ignore[call-overload]
        delete(AuthSession).where(
            col(AuthSession.token_hash) == _hash_session_token(token)
        )
    )
    session.commit()


def revoke_all_sessions(session: Session, keep_token: str | None = None) -> None:
    statement = delete(AuthSession)
    if keep_token:
        statement = statement.where(
            col(AuthSession.token_hash) != _hash_session_token(keep_token)
        )
    session.exec(statement)  # type: ignore[call-overload]
    session.commit()
