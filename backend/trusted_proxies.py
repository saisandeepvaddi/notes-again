import ipaddress
import logging
import os

from fastapi import Request
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

log = logging.getLogger(__name__)

PEER_SCOPE_KEY = "notes_again.peer"
DEFAULT_TRUSTED = "127.0.0.1,::1"

Network = ipaddress.IPv4Network | ipaddress.IPv6Network


def trusted_proxy_entries() -> list[str]:
    raw = os.environ.get("TRUSTED_PROXIES", "").strip() or DEFAULT_TRUSTED
    return [entry.strip() for entry in raw.split(",") if entry.strip()]


def _networks(entries: list[str]) -> list[Network] | None:
    if "*" in entries:
        return None
    networks: list[Network] = []
    for entry in entries:
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            log.warning(
                "Ignoring TRUSTED_PROXIES entry that isn't an IP or network: %s", entry
            )
    return networks


def is_trusted(host: str | None) -> bool:
    if not host:
        return False
    networks = _networks(trusted_proxy_entries())
    if networks is None:
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(address in network for network in networks)


def peer_is_trusted(request: Request) -> bool:
    return is_trusted(request.scope.get(PEER_SCOPE_KEY))


class ForwardedHeadersMiddleware:
    def __init__(self, app) -> None:
        self.app = app
        self.forwarded = ProxyHeadersMiddleware(
            app, trusted_hosts=trusted_proxy_entries()
        )

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] in ("http", "websocket"):
            client = scope.get("client")
            scope[PEER_SCOPE_KEY] = client[0] if client else None
        await self.forwarded(scope, receive, send)
