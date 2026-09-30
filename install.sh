#!/bin/sh
set -eu

REPO_URL="${NOTES_AGAIN_REPO:-https://github.com/saisandeepvaddi/notes-again.git}"
INSTALL_DIR="${NOTES_AGAIN_DIR:-notes-again}"
DOCS_URL="https://github.com/saisandeepvaddi/notes-again/blob/main/docs/self-hosting.md"
FIREBASE_DOCS_URL="https://github.com/saisandeepvaddi/notes-again/blob/main/docs/firebase-auth.md"
FIREBASE_COMPOSE="docker-compose.yml:docker-compose.firebase.yml"
ENV_FILE=.env

say() { printf '%s\n' "$*"; }
fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

TTY=""
if (: </dev/tty) 2>/dev/null; then
  TTY=/dev/tty
fi

ask() {
  ask_var=$1
  ask_prompt=$2
  ask_default=$3
  ask_answer=""
  if [ -n "$TTY" ]; then
    printf '%s [%s]: ' "$ask_prompt" "$ask_default" >"$TTY"
    IFS= read -r ask_answer <"$TTY" || ask_answer=""
  fi
  [ -n "$ask_answer" ] || ask_answer=$ask_default
  eval "$ask_var=\$ask_answer"
}

ask_secret() {
  ask_var=$1
  ask_prompt=$2
  ask_answer=""
  if [ -n "$TTY" ]; then
    printf '%s: ' "$ask_prompt" >"$TTY"
    stty -echo <"$TTY" 2>/dev/null || true
    IFS= read -r ask_answer <"$TTY" || ask_answer=""
    stty echo <"$TTY" 2>/dev/null || true
    printf '\n' >"$TTY"
  fi
  eval "$ask_var=\$ask_answer"
}

choose() {
  choose_var=$1
  choose_default=$2
  shift 2
  if [ -n "$TTY" ]; then
    choose_index=1
    for choose_option in "$@"; do
      printf '  %s) %s\n' "$choose_index" "$choose_option" >"$TTY"
      choose_index=$((choose_index + 1))
    done
  fi
  while :; do
    ask choose_pick "Choose" "$choose_default"
    case "$choose_pick" in
      *[!0-9]* | "") ;;
      *)
        if [ "$choose_pick" -ge 1 ] && [ "$choose_pick" -le $# ]; then
          eval "$choose_var=\$choose_pick"
          return
        fi
        ;;
    esac
    say "Pick a number from 1 to $#."
  done
}

confirm() {
  ask confirm_answer "$1 (y/n)" "$2"
  case "$confirm_answer" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

env_get() {
  [ -f "$ENV_FILE" ] || return 0
  KEY=$1 awk '
    BEGIN { k = ENVIRON["KEY"] }
    index($0, k "=") == 1 { v = substr($0, length(k) + 2) }
    END {
      if (v ~ /^'\''.*'\''$/) v = substr(v, 2, length(v) - 2)
      if (v != "") print v
    }
  ' "$ENV_FILE"
}

env_set() {
  touch "$ENV_FILE"
  case "$2" in
    *[!A-Za-z0-9_./:@,?=+%-]*) env_value="'$2'" ;;
    *) env_value=$2 ;;
  esac
  KEY=$1 VALUE=$env_value awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VALUE"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 } next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" >"$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

env_unset() {
  [ -f "$ENV_FILE" ] || return 0
  for env_key in "$@"; do
    KEY=$env_key awk 'BEGIN { k = ENVIRON["KEY"] } index($0, k "=") != 1' "$ENV_FILE" >"$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  done
}

current() {
  current_name=$1
  current_default=$2
  eval "current_env=\${NOTES_AGAIN_$current_name:-}"
  if [ -n "$current_env" ]; then
    printf '%s' "$current_env"
    return
  fi
  current_file=$(env_get "$current_name")
  printf '%s' "${current_file:-$current_default}"
}

has() { command -v "$1" >/dev/null 2>&1; }

docker_missing() {
  if ! has docker; then
    say "Docker (https://docs.docker.com/engine/install/)"
  elif ! docker compose version >/dev/null 2>&1; then
    say "Docker Compose v2 (the 'docker compose' command)"
  elif ! docker info >/dev/null 2>&1; then
    say "a running Docker daemon this user can reach"
  fi
}

direct_missing() {
  has uv || say "uv (https://docs.astral.sh/uv/getting-started/installation/)"
  if ! has node; then
    say "Node.js 22 or newer (https://nodejs.org)"
  else
    node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
    [ "$node_major" -ge 22 ] 2>/dev/null || say "Node.js 22 or newer (found $(node -v))"
  fi
  has pnpm || say "pnpm (https://pnpm.io/installation, or 'corepack enable')"
}

default_db_path() {
  case "$(uname -s)" in
    Darwin) printf '%s' "$HOME/Library/Application Support/notes-again/notes-again.db" ;;
    *) printf '%s' "${XDG_DATA_HOME:-$HOME/.local/share}/notes-again/notes-again.db" ;;
  esac
}

ask_network() {
  bind_now=$(current BIND_ADDRESS 127.0.0.1)
  [ "$bind_now" = "0.0.0.0" ] && bind_default=2 || bind_default=1
  say "Who should be able to open it?"
  choose bind_pick "$bind_default" \
    "Only this machine, or through a reverse proxy / tunnel you set up (safest)" \
    "Other devices on my network too"
  [ "$bind_pick" = 2 ] && BIND=0.0.0.0 || BIND=127.0.0.1

  while :; do
    ask PORT_ANSWER "Port" "$(current HOST_PORT 8000)"
    case "$PORT_ANSWER" in
      *[!0-9]* | "") ;;
      *) [ "$PORT_ANSWER" -ge 1 ] && [ "$PORT_ANSWER" -le 65535 ] && break ;;
    esac
    say "The port must be a number from 1 to 65535."
  done
  say ""
}

ask_auth() {
  case "$(current AUTH_MODE local)" in
    none) auth_default=2 ;;
    firebase) auth_default=3 ;;
    *) auth_default=1 ;;
  esac
  say "How should people sign in?"
  choose auth_pick "$auth_default" \
    "Username and password (you pick them on first launch)" \
    "No login" \
    "Firebase (accounts managed in a Firebase project)"
  case "$auth_pick" in
    2) AUTH=none ;;
    3) AUTH=firebase ;;
    *) AUTH=local ;;
  esac
  if [ "$AUTH" = none ] && [ "$BIND" = 0.0.0.0 ]; then
    say "With no login, anyone on your network can read and change your notes."
    confirm "Keep no login anyway?" n || AUTH=local
  fi

  firebase_ready=1
  if [ "$AUTH" = firebase ]; then
    say ""
    say "Firebase needs a project, a web app config and a service account key."
    say "Guide: $FIREBASE_DOCS_URL"
    ask FB_API_KEY "Firebase web API key" "$(current VITE_FIREBASE_API_KEY "")"
    ask FB_DOMAIN "Firebase auth domain" "$(current VITE_FIREBASE_AUTH_DOMAIN "")"
    ask FB_PROJECT "Firebase project id" "$(current VITE_FIREBASE_PROJECT_ID "")"
    ask FB_ALLOWED "Allowed emails, comma-separated (optional)" "$(current ALLOWED_EMAILS "")"
    [ -f firebase-service-account.json ] || firebase_ready=0
  fi
  say ""
}

save_auth() {
  firebase_credentials=$1
  env_set AUTH_MODE "$AUTH"
  if [ "$AUTH" = firebase ]; then
    env_set FIREBASE_CREDENTIALS_FILE "$firebase_credentials"
    env_set VITE_FIREBASE_API_KEY "$FB_API_KEY"
    env_set VITE_FIREBASE_AUTH_DOMAIN "$FB_DOMAIN"
    env_set VITE_FIREBASE_PROJECT_ID "$FB_PROJECT"
    if [ -n "$FB_ALLOWED" ]; then env_set ALLOWED_EMAILS "$FB_ALLOWED"; else env_unset ALLOWED_EMAILS; fi
  fi
}

stop_if_firebase_key_missing() {
  if [ "$firebase_ready" = 0 ]; then
    say "Firebase also needs the service account key saved as $(pwd)/firebase-service-account.json."
    say "Add it, then run this script again."
    exit 0
  fi
}

print_first_launch() {
  if [ "$AUTH" = local ]; then
    say "On first launch, sign in as admin with the temporary password the server prints."
  fi
}

setup_docker() {
  ENV_FILE=.env
  ask_network
  ask_auth

  if [ -n "$(current BACKUP_REPLICA_URL "")$(current R2_BUCKET "")" ]; then
    backup_default=2
  else
    backup_default=1
  fi
  say "Daily snapshots are always kept next to the database. Add an off-site copy too?"
  choose backup_pick "$backup_default" \
    "No" \
    "Yes, to S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3, MinIO)"
  if [ "$backup_pick" = 2 ]; then
    replica_default=$(current BACKUP_REPLICA_URL "")
    if [ -z "$replica_default" ] && [ -n "$(current R2_BUCKET "")" ]; then
      r2_host=$(current R2_ENDPOINT "")
      r2_host=${r2_host#https://}
      r2_host=${r2_host#http://}
      replica_default="s3://$(current R2_BUCKET "")/$(current R2_PATH "")?endpoint=$r2_host"
    fi
    say "Replica URL examples:"
    say "  Cloudflare R2: s3://<bucket>/db?endpoint=<account-id>.r2.cloudflarestorage.com"
    say "  Backblaze B2:  s3://<bucket>/db?endpoint=s3.<region>.backblazeb2.com"
    say "  AWS S3:        s3://<bucket>/db"
    while :; do
      ask REPLICA_URL "Replica URL" "${replica_default:-}"
      [ -n "$REPLICA_URL" ] && break
      say "A replica URL is needed for off-site backup."
    done
    ask KEY_ID "Access key id" "$(current LITESTREAM_ACCESS_KEY_ID "")"
    ask_secret SECRET_KEY "Secret access key (leave empty to keep the current one)"
  fi

  env_set BIND_ADDRESS "$BIND"
  env_set HOST_PORT "$PORT_ANSWER"
  save_auth /run/secrets/firebase.json
  if [ "$AUTH" = firebase ]; then
    env_set COMPOSE_FILE "$FIREBASE_COMPOSE"
  elif [ "$(env_get COMPOSE_FILE)" = "$FIREBASE_COMPOSE" ]; then
    env_unset COMPOSE_FILE
  fi
  if [ "$backup_pick" = 2 ]; then
    env_set BACKUP_REPLICA_URL "$REPLICA_URL"
    if [ -n "$KEY_ID" ]; then env_set LITESTREAM_ACCESS_KEY_ID "$KEY_ID"; else env_unset LITESTREAM_ACCESS_KEY_ID; fi
    [ -z "$SECRET_KEY" ] || env_set LITESTREAM_SECRET_ACCESS_KEY "$SECRET_KEY"
  else
    env_unset BACKUP_REPLICA_URL R2_BUCKET R2_PATH R2_ENDPOINT \
      LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY
  fi
  chmod 600 "$ENV_FILE"

  say ""
  say "Saved your answers to $(pwd)/$ENV_FILE"
  stop_if_firebase_key_missing

  confirm "Build and start Notes Again now?" y || {
    say "Start it later with: docker compose up -d --build"
    exit 0
  }

  say "Building and starting (the first build takes a few minutes)..."
  docker compose up -d --build </dev/null

  say "Waiting for the app to come up..."
  healthy=0
  for _ in $(seq 1 60); do
    if docker compose exec -T app python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz', timeout=2)" </dev/null >/dev/null 2>&1; then
      healthy=1
      break
    fi
    sleep 2
  done
  if [ "$healthy" = 0 ]; then
    say "The app didn't come up. Recent logs:"
    docker compose logs --tail=40 app </dev/null
    exit 1
  fi

  say ""
  say "Notes Again is running: http://localhost:$PORT_ANSWER"
  print_lan_address
  if [ "$AUTH" = local ]; then
    banner=$(docker compose logs --no-log-prefix app </dev/null 2>/dev/null | grep -A2 "first launch" | tail -2 || true)
    if [ -n "$banner" ]; then
      say ""
      say "First launch. Sign in with:"
      say "$banner"
      say "You'll pick your own username and password after signing in."
    else
      say "Sign in with your existing username and password."
    fi
  fi
  say ""
  say "Update later:    make update   (or: git pull && docker compose up -d --build)"
  say "Check the setup: docker compose exec app python backend/cli.py doctor"
  say "Docs:            $DOCS_URL"
}

print_lan_address() {
  if [ "$BIND" = 0.0.0.0 ]; then
    lan_ip=$( (ipconfig getifaddr en0 || hostname -I | awk '{print $1}') 2>/dev/null || true)
    [ -z "$lan_ip" ] || say "From other devices:  http://$lan_ip:$PORT_ANSWER"
  fi
}

setup_direct() {
  ENV_FILE=.env.local
  ask_network

  db_default=$(current DB_PATH "$(default_db_path)")
  say "Where should the database file live?"
  ask DB_ANSWER "Database file" "$db_default"
  say ""

  ask_auth
  say "Daily snapshots are kept in a backups/ folder next to the database."
  say "Off-site backup (Litestream) is only set up by the Docker install."
  say ""

  env_set BIND_ADDRESS "$BIND"
  env_set HOST_PORT "$PORT_ANSWER"
  if [ "$DB_ANSWER" = "$(default_db_path)" ]; then env_unset DB_PATH; else env_set DB_PATH "$DB_ANSWER"; fi
  save_auth "$(pwd)/firebase-service-account.json"
  chmod 600 "$ENV_FILE"
  say "Saved your answers to $(pwd)/$ENV_FILE"
  stop_if_firebase_key_missing

  say "Installing dependencies and building the frontend (a minute or two)..."
  (cd backend && uv sync --frozen) </dev/null
  (cd frontend && CI=1 pnpm install --frozen-lockfile && pnpm build) </dev/null

  say ""
  say "Notes Again is ready. Start it any time with:"
  say "  $(pwd)/scripts/serve.sh"
  say "It serves http://localhost:$PORT_ANSWER until you stop it (Ctrl+C)."
  print_lan_address
  print_first_launch
  say "Update later: git pull, then run this script again."
  say "Docs:         $DOCS_URL"
  say ""
  if confirm "Start it now?" y; then
    exec ./scripts/serve.sh </dev/null
  fi
}

main() {
  has git || fail "git isn't installed."

  script_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)
  if [ -f docker-compose.yml ] && [ -f docker-entrypoint.sh ]; then
    :
  elif [ -n "$script_dir" ] && [ -f "$script_dir/docker-compose.yml" ]; then
    cd "$script_dir"
  elif [ -d "$INSTALL_DIR/.git" ]; then
    cd "$INSTALL_DIR"
  else
    say "Cloning Notes Again into ./$INSTALL_DIR ..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" </dev/null
    cd "$INSTALL_DIR"
  fi
  say "Setting up Notes Again in $(pwd)"
  say ""

  missing_docker=$(docker_missing)
  missing_direct=$(direct_missing)
  case "${NOTES_AGAIN_METHOD:-}" in
    docker) method_default=1 ;;
    direct) method_default=2 ;;
    *)
      if [ -f .env.local ] && [ ! -f .env ]; then
        method_default=2
      elif [ -z "$missing_docker" ] || [ -n "$missing_direct" ]; then
        method_default=1
      else
        method_default=2
      fi
      ;;
  esac
  [ -z "$missing_docker" ] && docker_note="" || docker_note=" (not ready here)"
  [ -z "$missing_direct" ] && direct_note="" || direct_note=" (not ready here)"
  say "How do you want to run it?"
  choose method_pick "$method_default" \
    "Docker: runs in a container, restarts on reboot, includes off-site backup$docker_note" \
    "Directly on this machine: needs uv, Node.js 22+ and pnpm$direct_note"
  say ""

  if [ "$method_pick" = 1 ]; then
    if [ -n "$missing_docker" ]; then
      say "The Docker setup needs:"
      say "$missing_docker" | sed 's/^/  - /'
      fail "Install it and run this script again, or pick the other option."
    fi
    setup_docker
  else
    if [ -n "$missing_direct" ]; then
      say "Running directly needs:"
      say "$missing_direct" | sed 's/^/  - /'
      fail "Install them and run this script again, or pick the other option."
    fi
    setup_direct
  fi
}

main "$@"
