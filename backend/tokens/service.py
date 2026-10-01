import datetime
import hashlib
import secrets

from sqlmodel import Session, select

from db.models import ApiToken, utcnow

TOKEN_PREFIX = "nal_"
CAPTURE_SCOPE = "capture"
APP_SCOPE = "app"
TOKEN_SCOPES = (CAPTURE_SCOPE, APP_SCOPE)

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
    if scope == APP_SCOPE:
        return True
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


def issue_token(
    session: Session,
    *,
    name: str,
    scope: str,
    created_by: str | None,
    expires_in_days: int | None = None,
) -> tuple[ApiToken, str]:
    token = generate_token()
    record = ApiToken(
        name=name,
        token_hash=hash_token(token),
        prefix=display_prefix(token),
        scope=scope,
        created_by=created_by,
        expires_at=(
            utcnow() + datetime.timedelta(days=expires_in_days) if expires_in_days else None
        ),
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record, token


def revoke(session: Session, record: ApiToken) -> None:
    record.revoked_at = utcnow()
    session.add(record)
    session.commit()


def record_use(session: Session, record: ApiToken) -> None:
    now = utcnow()
    if record.last_used_at is None or now - _aware(record.last_used_at) > LAST_USED_GRANULARITY:
        record.last_used_at = now
        session.add(record)
        session.commit()
