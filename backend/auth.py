import logging
import os
from typing import Annotated

import firebase_admin
from fastapi import Depends, Request
from fastapi.exceptions import HTTPException
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from db.setup import SessionDep
from tokens.service import TOKEN_PREFIX, find_active_token, record_use, scope_allows

log = logging.getLogger(__name__)

AUTH_DISABLED = os.environ.get("AUTH_DISABLED", "").strip() in {"1", "true", "yes"}
FIREBASE_CREDENTIALS_FILE = os.environ.get("FIREBASE_CREDENTIALS_FILE", "").strip()

_DEV_IDENTITY = {"email": "dev@localhost", "uid": "dev"}

if AUTH_DISABLED:
    log.warning("AUTH_DISABLED is set — API auth checks are bypassed.")
else:
    if not FIREBASE_CREDENTIALS_FILE:
        raise RuntimeError(
            "Auth is enabled but FIREBASE_CREDENTIALS_FILE is not set. Point it at a "
            "Firebase service account JSON, or set AUTH_DISABLED=1 for local dev."
        )
    firebase_admin.initialize_app(credentials.Certificate(FIREBASE_CREDENTIALS_FILE))


def allowed_emails() -> set[str]:
    raw = os.environ.get("ALLOWED_EMAILS", "")
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _is_allowed(email: str | None) -> bool:
    allowed = allowed_emails()
    return not allowed or (email or "").lower() in allowed


def _extract_token(request: Request) -> str | None:
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
        log.warning("Rejected sign-in from an email not in ALLOWED_EMAILS: %s", claims.get("email"))
        raise HTTPException(status_code=403, detail="This account is not allowed")
    return {**claims, "auth": "session"}


def _identity_from_api_token(request: Request, session: SessionDep, token: str) -> dict:
    record = find_active_token(session, token)
    if record is None or not _is_allowed(record.created_by):
        raise HTTPException(status_code=401, detail="Invalid authentication")
    if not scope_allows(record.scope, request.method, request.url.path):
        raise HTTPException(status_code=403, detail="This token isn't allowed to do that")
    record_use(session, record)
    return {
        "email": record.created_by,
        "uid": f"token:{record.id}",
        "auth": "api_token",
        "scope": record.scope,
    }


def require_user(request: Request, session: SessionDep) -> dict:
    if AUTH_DISABLED:
        return _DEV_IDENTITY

    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if token.startswith(TOKEN_PREFIX):
        return _identity_from_api_token(request, session, token)
    return _identity_from_firebase(token)


def require_session_user(identity: Annotated[dict, Depends(require_user)]) -> dict:
    if identity.get("auth") == "api_token":
        raise HTTPException(status_code=403, detail="API tokens can't manage tokens")
    return identity
