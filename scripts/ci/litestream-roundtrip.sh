#!/bin/sh
set -eu

IMAGE="${IMAGE:-notes-again:ci}"
PORT="${PORT:-8765}"
RUN="nal-ci-$$"
URL="http://127.0.0.1:$PORT"

cleanup() {
  docker rm -f "$RUN-a" "$RUN-b" >/dev/null 2>&1 || true
  docker volume rm "$RUN-data-a" "$RUN-data-b" "$RUN-replica" >/dev/null 2>&1 || true
}
trap cleanup EXIT

start() {
  docker run -d --name "$RUN-$1" \
    -e AUTH_DISABLED=1 \
    -e BACKUP_INTERVAL_HOURS=0 \
    -e BACKUP_REPLICA_URL=file:///replica \
    -v "$RUN-data-$1:/data" \
    -v "$RUN-replica:/replica" \
    -p "127.0.0.1:$PORT:8000" \
    "$IMAGE" >/dev/null
  tries=0
  until curl -fsS "$URL/healthz" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "Container $1 never became healthy:" >&2
      docker logs "$RUN-$1" >&2
      exit 1
    fi
    sleep 1
  done
}

count_notes() {
  curl -fsS "$URL/api/notes/list" | sed -n 's/.*"total":\([0-9]*\).*/\1/p'
}

start a
for name in first second third; do
  curl -fsS -X POST "$URL/api/notes/create" \
    -H "content-type: application/json" \
    -d "{\"name\":\"Replicated $name\",\"content\":\"body\"}" >/dev/null
done
before=$(count_notes)
sleep 5
docker stop -t 30 "$RUN-a" >/dev/null
docker logs "$RUN-a" 2>&1 | tail -n 20
docker rm "$RUN-a" >/dev/null
docker volume rm "$RUN-data-a" >/dev/null

start b
docker logs "$RUN-b" 2>&1 | grep -i "restor" || true
after=$(count_notes)
echo "Notes before: $before, after restoring from the replica: $after"
if [ "$before" != "3" ] || [ "$after" != "3" ]; then
  docker logs "$RUN-b" >&2
  exit 1
fi
echo "Litestream round trip passed."
