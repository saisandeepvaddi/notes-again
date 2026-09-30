import logging
import os
from functools import cache

import jwt
from fastapi import Request

from trusted_proxies import peer_is_trusted

log = logging.getLogger(__name__)

DEFAULT_PROXY_HEADER = "Remote-User"
CLOUDFLARE_LOGOUT_URL = "/cdn-cgi/access/logout"


def proxy_header() -> str:
    return os.environ.get("AUTH_PROXY_HEADER", "").strip() or DEFAULT_PROXY_HEADER


def proxy_logout_url() -> str | None:
    return os.environ.get("AUTH_PROXY_LOGOUT_URL", "").strip() or None


def proxy_user(request: Request) -> str | None:
    if not peer_is_trusted(request):
        return None
    return request.headers.get(proxy_header(), "").strip() or None


def cloudflare_team_domain() -> str:
    raw = os.environ.get("CF_ACCESS_TEAM_DOMAIN", "").strip().lower()
    raw = raw.removeprefix("https://").removeprefix("http://").rstrip("/")
    if raw and "." not in raw:
        raw = f"{raw}.cloudflareaccess.com"
    return raw


def cloudflare_audience() -> str:
    return os.environ.get("CF_ACCESS_AUD", "").strip()


def check_cloudflare_config() -> None:
    missing = [
        name
        for name, value in (
            ("CF_ACCESS_TEAM_DOMAIN", cloudflare_team_domain()),
            ("CF_ACCESS_AUD", cloudflare_audience()),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            f"AUTH_MODE is cloudflare-access but {' and '.join(missing)} "
            f"{'is' if len(missing) == 1 else 'are'} not set. See docs/self-hosting.md."
        )


@cache
def _jwks_client(team_domain: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://{team_domain}/cdn-cgi/access/certs", lifespan=3600)


def cloudflare_email(request: Request) -> str | None:
    token = request.headers.get("Cf-Access-Jwt-Assertion") or request.cookies.get(
        "CF_Authorization"
    )
    if not token:
        return None
    team_domain = cloudflare_team_domain()
    try:
        signing_key = _jwks_client(team_domain).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=cloudflare_audience(),
            issuer=f"https://{team_domain}",
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        log.warning("Rejected Cloudflare Access token: %s", exc)
        return None
    return claims.get("email") or claims.get("common_name") or None
