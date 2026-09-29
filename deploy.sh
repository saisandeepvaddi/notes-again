#!/usr/bin/env bash
# One-shot deploy: push -> ssh -> pull -> rebuild -> restart.
# Not committed to git (personal convenience script) — fill in REMOTE_HOST below.
set -euo pipefail

# --- configure once -----------------------------------------------------
REMOTE_USER=$VPS_USER
REMOTE_HOST=$VPS_HOST
REMOTE_PATH="~/notes-again"
BRANCH="main"
# -------------------------------------------------------------------------

cd "$(dirname "$0")"

if [ "$REMOTE_HOST" = "CHANGE_ME" ]; then
  echo "Set REMOTE_HOST in deploy.sh first." >&2
  exit 1
fi

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" != "$BRANCH" ]; then
  read -r -p "You're on '$current_branch', deploying '$BRANCH'. Continue? [y/N] " ans
  [ "$ans" = "y" ] || exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes — commit or stash first, nothing was deployed:" >&2
  git status --short
  exit 1
fi

echo "==> Pushing $BRANCH..."
git push origin "$BRANCH"

echo "==> Deploying on $REMOTE_HOST..."
ssh "$REMOTE_USER@$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
cd $REMOTE_PATH
echo "-- pulling --"
git fetch origin
git checkout $BRANCH
git reset --hard "origin/$BRANCH"
echo "-- building (this is the slow part) --"
docker compose build
echo "-- restarting --"
docker compose up -d
echo "-- recent logs --"
docker compose logs --tail=20 app
EOF

echo "==> Done."
