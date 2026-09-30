#!/bin/sh
set -e

DB_PATH="${DB_PATH:-/data/notes-again.db}"
export DB_PATH
mkdir -p "$(dirname "$DB_PATH")"

for name in LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY; do
  file_var="${name}_FILE"
  eval "file_path=\${$file_var:-}"
  if [ -n "$file_path" ]; then
    if [ ! -r "$file_path" ]; then
      echo "$file_var points at $file_path, which can't be read." >&2
      exit 1
    fi
    eval "export $name=\"\$(cat \"\$file_path\")\""
  fi
done

if [ -z "${TRUSTED_PROXIES:-}" ] && { [ -z "${BIND_ADDRESS:-}" ] || [ "${BIND_ADDRESS}" = "127.0.0.1" ]; }; then
  gateway=$(python -c 'import socket, struct
for line in open("/proc/net/route").readlines()[1:]:
    f = line.split()
    if f[1] == "00000000":
        print(socket.inet_ntoa(struct.pack("<L", int(f[2], 16))))
        break' 2>/dev/null || true)
  if [ -n "$gateway" ]; then
    export TRUSTED_PROXIES="127.0.0.1,::1,$gateway"
  fi
fi

APP="uvicorn --app-dir backend main:app --no-proxy-headers --host 0.0.0.0 --port ${PORT:-8000}"

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
