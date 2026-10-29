import os
import socket
import sys
import threading
import time

import uvicorn

READY_PREFIX = "NOTES_AGAIN_READY "


def exit_when_parent_closes_stdin() -> None:
    sys.stdin.read()
    os._exit(0)


def announce_when_started(server: uvicorn.Server, port: int) -> None:
    while not server.started:
        if server.should_exit:
            return
        time.sleep(0.05)
    print(f"{READY_PREFIX}{port}", flush=True)


def main() -> None:
    os.environ["AUTH_MODE"] = "desktop"
    for name in (
        "AUTH_DISABLED",
        "CORS_ORIGINS",
        "CORS_ORIGIN_REGEX",
        "TRUSTED_PROXIES",
    ):
        os.environ.pop(name, None)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]

    config = uvicorn.Config("main:app", proxy_headers=False, log_level="info")
    server = uvicorn.Server(config)
    threading.Thread(target=exit_when_parent_closes_stdin, daemon=True).start()
    threading.Thread(
        target=announce_when_started, args=(server, port), daemon=True
    ).start()
    server.run(sockets=[sock])


if __name__ == "__main__":
    main()
