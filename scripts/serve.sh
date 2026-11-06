#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

db_override=${DB:-}
unset AUTH_MODE AUTH_DISABLED CORS_ORIGINS FRONTEND_DIST DB_PATH BIND_ADDRESS HOST_PORT DB

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi
if [ -n "$db_override" ]; then
  export DB_PATH="$db_override"
fi

server=server/target/release/notes-again-server
if [ ! -x "$server" ] || [ ! -f frontend/dist/client/index.html ]; then
  echo "Not built yet. Run ./install.sh or 'make run' first." >&2
  exit 1
fi

export FRONTEND_DIST="$(pwd)/frontend/dist/client"
exec "$server" serve --host "${BIND_ADDRESS:-127.0.0.1}" --port "${HOST_PORT:-8000}"
