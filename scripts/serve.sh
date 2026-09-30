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

if [ ! -x backend/.venv/bin/uvicorn ] || [ ! -f frontend/dist/client/index.html ]; then
  echo "Not built yet. Run ./install.sh or 'make run' first." >&2
  exit 1
fi

exec backend/.venv/bin/uvicorn --app-dir backend main:app --no-proxy-headers \
  --host "${BIND_ADDRESS:-127.0.0.1}" --port "${HOST_PORT:-8000}"
