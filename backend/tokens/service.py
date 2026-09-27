import datetime
import hashlib
import secrets

from sqlmodel import Session, select

from db.models import ApiToken, utcnow

TOKEN_PREFIX = "nal_"
CAPTURE_SCOPE = "capture"

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
    return dt if dt.tzinfo else dt.replace(tzinfo=datetime.UTC)


def find_active_token(session: Session, token: str) -> ApiToken | None:
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
