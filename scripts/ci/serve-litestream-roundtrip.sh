#!/bin/sh
set -eu

cd "$(dirname "$0")/../.."

PORT="${PORT:-8766}"
URL="http://127.0.0.1:$PORT"

if [ -f .env.local ]; then
  echo "Refusing to run: .env.local already exists." >&2
  exit 1
fi

work=$(mktemp -d)
pid=""
cleanup() {
  [ -z "$pid" ] || kill "$pid" 2>/dev/null || true
  rm -f .env.local
  rm -rf "$work"
}
trap cleanup EXIT

cat >.env.local <<ENV
WEB_UI=off
AUTH_MODE=none
HOST_PORT=$PORT
BACKUP_INTERVAL_HOURS=0
BACKUP_REPLICA_URL=file://$work/replica
ENV

start() {
  DB="$work/notes.db" scripts/serve.sh >"$work/$1.log" 2>&1 &
  pid=$!
  tries=0
  until curl -fsS "$URL/healthz" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "The server never became healthy:" >&2
      cat "$work/$1.log" >&2
      exit 1
    fi
    sleep 1
  done
}

stop() {
  kill -TERM "$pid"
  wait "$pid" || true
  pid=""
}

count_notes() {
  curl -fsS "$URL/api/notes/list" | sed -n 's/.*"total":\([0-9]*\).*/\1/p'
}

start first
for name in first second third; do
  curl -fsS -X POST "$URL/api/notes/create" \
    -H "content-type: application/json" \
    -d "{\"name\":\"Replicated $name\",\"content\":\"body\"}" >/dev/null
done
before=$(count_notes)
sleep 5
stop
rm -f "$work/notes.db" "$work/notes.db-wal" "$work/notes.db-shm"

start second
after=$(count_notes)
stop
grep -i "restor" "$work/second.log" || true
echo "Notes before: $before, after restoring from the replica: $after"
if [ "$before" != "3" ] || [ "$after" != "3" ]; then
  cat "$work/first.log" "$work/second.log" >&2
  exit 1
fi
echo "Direct-install Litestream round trip passed."
