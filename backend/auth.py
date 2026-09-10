"""Request authentication.

In production the app sits behind Cloudflare Access, which handles the Google
login at the edge and only lets allowed emails through. Access also forwards a
signed JWT on every request (the ``Cf-Access-Jwt-Assertion`` header, mirrored by
the ``CF_Authorization`` cookie). We verify that token here so that reaching the
container directly — bypassing the tunnel — is still rejected.

Local dev has no Cloudflare in front, so set ``AUTH_DISABLED=1`` there.
"""

import logging
import os

import jwt
from fastapi import Request
from fastapi.exceptions import HTTPException

log = logging.getLogger(__name__)

AUTH_DISABLED = os.environ.get("AUTH_DISABLED", "").strip() in {"1", "true", "yes"}
CF_ACCESS_TEAM_DOMAIN = os.environ.get("CF_ACCESS_TEAM_DOMAIN", "").strip().rstrip("/")
CF_ACCESS_AUD = os.environ.get("CF_ACCESS_AUD", "").strip()

_DEV_IDENTITY = {"email": "dev@localhost"}

if AUTH_DISABLED:
    log.warning("AUTH_DISABLED is set — API auth checks are bypassed.")
    _jwk_client = None
else:
    if not CF_ACCESS_TEAM_DOMAIN or not CF_ACCESS_AUD:
        raise RuntimeError(
            "Auth is enabled but CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are not set. "
            "Set both, or set AUTH_DISABLED=1 for local dev."
        )
    _jwk_client = jwt.PyJWKClient(f"{CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs")


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("Cf-Access-Jwt-Assertion")
    if header:
        return header
    return request.cookies.get("CF_Authorization")


def require_user(request: Request) -> dict:
    """FastAPI dependency: verify the Cloudflare Access token, or 401."""
    if AUTH_DISABLED:
        return _DEV_IDENTITY

    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=CF_ACCESS_AUD,
            issuer=CF_ACCESS_TEAM_DOMAIN,
        )
    except jwt.PyJWTError as exc:
        log.warning("Rejected Access token: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid authentication") from exc

    return claims
