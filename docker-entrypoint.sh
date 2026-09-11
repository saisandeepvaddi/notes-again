#!/bin/sh
set -e

DB_PATH="${DB_PATH:-/data/note-and-learn.db}"
mkdir -p "$(dirname "$DB_PATH")"

run_app() {
  exec uvicorn --app-dir backend main:app --host 0.0.0.0 --port "${PORT:-8000}"
}

# Litestream is optional: only kicks in when R2 credentials are provided.
if [ -n "${LITESTREAM_ACCESS_KEY_ID:-}" ]; then
  if [ ! -f "$DB_PATH" ]; then
    echo "No local DB at $DB_PATH — restoring latest snapshot from R2 (if any)..."
    litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_PATH"
  fi
  echo "Running under Litestream replication."
  exec litestream replicate -config /etc/litestream.yml -exec \
    "uvicorn --app-dir backend main:app --host 0.0.0.0 --port ${PORT:-8000}"
else
  echo "LITESTREAM_ACCESS_KEY_ID not set — running without backup."
  run_app
fi
