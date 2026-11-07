#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

db_override=${DB:-}
unset AUTH_MODE AUTH_DISABLED CORS_ORIGINS FRONTEND_DIST DB_PATH BIND_ADDRESS HOST_PORT DB WEB_UI \
  BACKUP_REPLICA_URL R2_BUCKET R2_PATH R2_ENDPOINT

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi
if [ -n "$db_override" ]; then
  export DB_PATH="$db_override"
fi

case "$(printf '%s' "${WEB_UI:-on}" | tr '[:upper:]' '[:lower:]')" in
  off | 0 | false | no) web_ui=off ;;
  *) web_ui=on ;;
esac

server=server/target/release/notes-again-server
if [ ! -x "$server" ] || { [ "$web_ui" = on ] && [ ! -f frontend/dist/client/index.html ]; }; then
  echo "Not built yet. Run ./install.sh or 'make run' first." >&2
  exit 1
fi

export FRONTEND_DIST="$(pwd)/frontend/dist/client"
serve="$server serve --host ${BIND_ADDRESS:-127.0.0.1} --port ${HOST_PORT:-8000}"

if [ -z "${BACKUP_REPLICA_URL:-}" ] && [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ENDPOINT:-}" ] \
  && [ -n "${LITESTREAM_ACCESS_KEY_ID:-}" ]; then
  r2_host=${R2_ENDPOINT#https://}
  r2_host=${r2_host#http://}
  BACKUP_REPLICA_URL="s3://${R2_BUCKET}/${R2_PATH:-}?endpoint=${r2_host}"
fi

if [ -z "${BACKUP_REPLICA_URL:-}" ]; then
  exec $serve
fi

PATH="$PATH:$HOME/.local/bin"
if ! command -v litestream >/dev/null 2>&1; then
  echo "BACKUP_REPLICA_URL is set, but Litestream isn't installed." >&2
  echo "Run ./install.sh again to install it, or remove BACKUP_REPLICA_URL from .env.local." >&2
  exit 1
fi

if [ -z "${DB_PATH:-}" ]; then
  case "$(uname -s)" in
    Darwin) DB_PATH="$HOME/Library/Application Support/notes-again/notes-again.db" ;;
    *) DB_PATH="${XDG_DATA_HOME:-$HOME/.local/share}/notes-again/notes-again.db" ;;
  esac
fi
export DB_PATH BACKUP_REPLICA_URL
mkdir -p "$(dirname "$DB_PATH")"

if [ ! -f "$DB_PATH" ]; then
  echo "No database at $DB_PATH; restoring the latest off-site backup, if there is one..."
  litestream restore -if-replica-exists -config litestream.yml "$DB_PATH"
fi
echo "Running under Litestream replication to $BACKUP_REPLICA_URL"
exec litestream replicate -config litestream.yml -exec "$serve"
