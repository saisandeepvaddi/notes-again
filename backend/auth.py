import hmac
import logging
import os
from typing import Annotated, Literal

from fastapi import Depends, Request
from fastapi.exceptions import HTTPException
from sqlmodel import Session

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    from firebase_admin import credentials
except ImportError:
    firebase_admin = None

from db.setup import SessionDep
from external_auth import (
    CLOUDFLARE_LOGOUT_URL,
    check_cloudflare_config,
    cloudflare_email,
    proxy_logout_url,
    proxy_user,
)
from local_auth.service import SESSION_COOKIE, find_session, get_local_auth
from tokens.service import TOKEN_PREFIX, find_active_token, record_use, scope_allows

log = logging.getLogger(__name__)

AuthMode = Literal["local", "firebase", "none", "proxy", "cloudflare-access", "desktop"]
AUTH_MODES: tuple[AuthMode, ...] = (
    "local",
    "firebase",
    "none",
    "proxy",
    "cloudflare-access",
    "desktop",
)
EXTERNAL_MODES: tuple[AuthMode, ...] = ("proxy", "cloudflare-access")
EMAIL_MODES: tuple[AuthMode, ...] = ("firebase", "proxy", "cloudflare-access")

FIREBASE_CREDENTIALS_FILE = os.environ.get("FIREBASE_CREDENTIALS_FILE", "").strip()

DESKTOP_COOKIE = "notes_again_desktop"

_NO_AUTH_IDENTITY = {"email": "dev@localhost", "uid": "dev", "auth": "none"}


def _resolve_auth_mode() -> AuthMode:
    raw = os.environ.get("AUTH_MODE", "").strip().lower()
    if raw:
        if raw not in AUTH_MODES:
            raise RuntimeError(
                f"AUTH_MODE must be one of {', '.join(AUTH_MODES)}; got {raw!r}."
            )
        return raw  # type: ignore[return-value]
    if os.environ.get("AUTH_DISABLED", "").strip() in {"1", "true", "yes"}:
        return "none"
    return "local"


AUTH_MODE: AuthMode = _resolve_auth_mode()

if AUTH_MODE == "none":
    log.warning("AUTH_MODE is none: API auth checks are bypassed.")
elif AUTH_MODE == "firebase":
    if firebase_admin is None:
        raise RuntimeError(
            "AUTH_MODE is firebase but the firebase-admin package isn't installed."
        )
    if not FIREBASE_CREDENTIALS_FILE:
        raise RuntimeError(
            "AUTH_MODE is firebase but FIREBASE_CREDENTIALS_FILE is not set. Point it at a "
            "Firebase service account JSON. See docs/firebase-auth.md."
        )
    if not os.path.isfile(FIREBASE_CREDENTIALS_FILE):
        raise RuntimeError(
            f"AUTH_MODE is firebase but FIREBASE_CREDENTIALS_FILE ({FIREBASE_CREDENTIALS_FILE}) "
            "doesn't exist. See docs/firebase-auth.md, or unset AUTH_MODE to use username "
            "and password sign-in."
        )
    firebase_admin.initialize_app(credentials.Certificate(FIREBASE_CREDENTIALS_FILE))
elif AUTH_MODE == "cloudflare-access":
    check_cloudflare_config()
elif AUTH_MODE == "desktop" and not os.environ.get("DESKTOP_SECRET", "").strip():
    raise RuntimeError("AUTH_MODE is desktop but DESKTOP_SECRET is not set.")

if AUTH_MODE != "firebase" and FIREBASE_CREDENTIALS_FILE:
    log.info(
        "FIREBASE_CREDENTIALS_FILE is set but AUTH_MODE isn't firebase; ignoring it."
    )


def effective_auth_mode(session: Session) -> AuthMode:
    if AUTH_MODE == "local":
        record = get_local_auth(session)
        if record is not None and not record.enabled:
            return "none"
    return AUTH_MODE


def firebase_web_config() -> dict[str, str] | None:
    config = {
        "apiKey": os.environ.get("VITE_FIREBASE_API_KEY", "").strip(),
        "authDomain": os.environ.get("VITE_FIREBASE_AUTH_DOMAIN", "").strip(),
        "projectId": os.environ.get("VITE_FIREBASE_PROJECT_ID", "").strip(),
    }
    return config if all(config.values()) else None


def allowed_emails() -> set[str]:
    raw = os.environ.get("ALLOWED_EMAILS", "")
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _is_allowed(email: str | None) -> bool:
    if AUTH_MODE not in EMAIL_MODES:
        return True
    allowed = allowed_emails()
    return not allowed or (email or "").lower() in allowed


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.removeprefix("Bearer ").strip() or None
    return None


def _identity_from_firebase(token: str) -> dict:
    try:
        claims = firebase_auth.verify_id_token(token)
    except Exception as exc:
        log.warning("Rejected Firebase token: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid authentication") from exc

    if not _is_allowed(claims.get("email")):
        log.warning(
            "Rejected sign-in from an email not in ALLOWED_EMAILS: %s",
            claims.get("email"),
        )
        raise HTTPException(status_code=403, detail="This account is not allowed")
    return {**claims, "auth": "session"}


def local_identity(request: Request, session: Session) -> dict | None:
    token = request.cookies.get(SESSION_COOKIE)
    record = get_local_auth(session)
    if not token or record is None or find_session(session, token) is None:
        return None
    return {
        "email": None,
        "uid": f"local:{record.username}",
        "username": record.username,
        "auth": "session",
    }


def desktop_secret_matches(candidate: str | None) -> bool:
    secret = os.environ.get("DESKTOP_SECRET", "").strip()
    if not secret or not candidate:
        return False
    return hmac.compare_digest(candidate.encode(), secret.encode())


def desktop_identity(request: Request) -> dict | None:
    if not desktop_secret_matches(request.cookies.get(DESKTOP_COOKIE)):
        return None
    return {"email": None, "uid": "desktop", "username": None, "auth": "session"}


def external_identity(request: Request) -> dict | None:
    if AUTH_MODE == "proxy":
        user = proxy_user(request)
        kind = "proxy"
    elif AUTH_MODE == "cloudflare-access":
        user = cloudflare_email(request)
        kind = "cloudflare"
    else:
        return None
    if user is None:
        return None
    if not _is_allowed(user):
        log.warning("Rejected sign-in from a user not in ALLOWED_EMAILS: %s", user)
        raise HTTPException(status_code=403, detail="This account is not allowed")
    return {"email": user, "uid": f"{kind}:{user}", "username": user, "auth": "session"}


def external_logout_url() -> str | None:
    if AUTH_MODE == "proxy":
        return proxy_logout_url()
    if AUTH_MODE == "cloudflare-access":
        return CLOUDFLARE_LOGOUT_URL
    return None


def _identity_from_api_token(request: Request, session: SessionDep, token: str) -> dict:
    record = find_active_token(session, token)
    if record is None or not _is_allowed(record.created_by):
        raise HTTPException(status_code=401, detail="Invalid authentication")
    if not scope_allows(record.scope, request.method, request.url.path):
        raise HTTPException(
            status_code=403, detail="This token isn't allowed to do that"
        )
    record_use(session, record)
    return {
        "email": record.created_by,
        "uid": f"token:{record.id}",
        "auth": "api_token",
        "scope": record.scope,
    }


def require_user(request: Request, session: SessionDep) -> dict:
    mode = effective_auth_mode(session)
    if mode == "none":
        return _NO_AUTH_IDENTITY

    token = bearer_token(request)
    if token and token.startswith(TOKEN_PREFIX):
        return _identity_from_api_token(request, session, token)

    if mode == "local" or mode == "desktop" or mode in EXTERNAL_MODES:
        if mode == "local":
            identity = local_identity(request, session)
        elif mode == "desktop":
            identity = desktop_identity(request)
        else:
            identity = external_identity(request)
        if identity is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return identity

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _identity_from_firebase(token)


def require_session_user(identity: Annotated[dict, Depends(require_user)]) -> dict:
    if identity.get("auth") == "api_token":
        raise HTTPException(status_code=403, detail="API tokens can't manage tokens")
    return identity
