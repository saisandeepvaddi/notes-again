"""Personal API tokens: generation, hashing, lookup, and what each scope may call.

Tokens are random (256 bits), so a plain SHA-256 is enough to store them: unlike
passwords there is nothing to brute-force, and it lets us look a token up by its
hash with a single indexed query.
"""

import datetime
import hashlib
import secrets

from sqlmodel import Session, select

from db.models import ApiToken, utcnow

TOKEN_PREFIX = "nal_"
CAPTURE_SCOPE = "capture"

# Exactly what the browser extension needs to save a note: list projects/tags
# for autocomplete, create-if-missing by name, then create the note. Everything
# else (reading or deleting notes, settings, import, managing tokens) needs a
# real sign-in.
CAPTURE_ROUTES: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/api/projects/list"),
        ("GET", "/api/tags/list"),
        ("POST", "/api/projects/create"),
        ("POST", "/api/tags/create"),
        ("POST", "/api/notes/create"),
    }
)
SCOPE_ROUTES: dict[str, frozenset[tuple[str, str]]] = {CAPTURE_SCOPE: CAPTURE_ROUTES}

# Recording last use on every request would turn each read into a write.
LAST_USED_GRANULARITY = datetime.timedelta(minutes=5)


def generate_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def display_prefix(token: str) -> str:
    return token[: len(TOKEN_PREFIX) + 6]


def scope_allows(scope: str, method: str, path: str) -> bool:
    routes = SCOPE_ROUTES.get(scope, frozenset())
    return (method.upper(), path.rstrip("/") or "/") in routes


def _aware(dt: datetime.datetime) -> datetime.datetime:
    # SQLite hands back naive datetimes; everything here is UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=datetime.UTC)


def find_active_token(session: Session, token: str) -> ApiToken | None:
    """The token's record if it exists, isn't revoked, and hasn't expired."""
    record = session.exec(
        select(ApiToken).where(ApiToken.token_hash == hash_token(token))
    ).one_or_none()
    if record is None or record.revoked_at is not None:
        return None
    if record.expires_at is not None and _aware(record.expires_at) <= utcnow():
        return None
    return record


def record_use(session: Session, record: ApiToken) -> None:
    now = utcnow()
    if record.last_used_at is None or now - _aware(record.last_used_at) > LAST_USED_GRANULARITY:
        record.last_used_at = now
        session.add(record)
        session.commit()
