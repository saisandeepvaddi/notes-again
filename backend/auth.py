"""Request authentication via Firebase Auth.

The frontend signs the user in with Firebase (email/password) and sends the
resulting ID token as ``Authorization: Bearer <token>``. We verify it here with
the Firebase Admin SDK. Only users you create in the Firebase console can obtain
a token, so that console is the whole user-management surface.

Local dev has no Firebase in front — set ``AUTH_DISABLED=1`` there.
"""

import logging
import os

import firebase_admin
from fastapi import Request
from fastapi.exceptions import HTTPException
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

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


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.removeprefix("Bearer ").strip() or None
    return None


def require_user(request: Request) -> dict:
    """FastAPI dependency: verify the Firebase ID token, or 401."""
    if AUTH_DISABLED:
        return _DEV_IDENTITY

    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        return firebase_auth.verify_id_token(token)
    except Exception as exc:
        log.warning("Rejected Firebase token: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid authentication") from exc
