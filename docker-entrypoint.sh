#!/bin/sh
set -e

DB_PATH="${DB_PATH:-/data/notes-again.db}"
export DB_PATH
mkdir -p "$(dirname "$DB_PATH")"

APP="uvicorn --app-dir backend main:app --host 0.0.0.0 --port ${PORT:-8000}"

if [ -z "${BACKUP_REPLICA_URL:-}" ] && [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ENDPOINT:-}" ] \
  && [ -n "${LITESTREAM_ACCESS_KEY_ID:-}" ]; then
  R2_HOST="${R2_ENDPOINT#https://}"
  R2_HOST="${R2_HOST#http://}"
  BACKUP_REPLICA_URL="s3://${R2_BUCKET}/${R2_PATH:-}?endpoint=${R2_HOST}"
fi

if [ -z "${BACKUP_REPLICA_URL:-}" ]; then
  echo "BACKUP_REPLICA_URL not set; running without off-site backup."
  exec $APP
fi

export BACKUP_REPLICA_URL
if [ ! -f "$DB_PATH" ]; then
  echo "No local DB at $DB_PATH; restoring the latest off-site backup, if there is one..."
  litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_PATH"
fi
echo "Running under Litestream replication."
exec litestream replicate -config /etc/litestream.yml -exec "$APP"
