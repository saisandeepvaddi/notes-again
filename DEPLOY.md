# Deploying note-and-learn

Single container: FastAPI serves the API **and** the prebuilt SPA on one port.
SQLite lives on a mounted volume; Litestream streams it to Cloudflare R2.

## What's in the box

- **Frontend** — TanStack Start built in SPA mode (`spa.enabled` in
  `frontend/vite.config.ts`). `pnpm build` emits `frontend/dist/client/`
  (`index.html` + `assets/`). No Node server at runtime.
- **Backend** — `uvicorn --app-dir backend main:app`. Serves `/api/*`, and
  everything else falls back to the SPA `index.html`.
- **DB** — `DB_PATH` env var (default `/data/note-and-learn.db`).
- **Backups** — `docker-entrypoint.sh` runs the app under
  `litestream replicate` when R2 creds are present, and restores from R2 on
  first boot if the volume is empty.

## One-time setup

1. **Cloudflare R2** — create a bucket (e.g. `note-and-learn-backups`) and an
   R2 API token with *Object Read & Write*. That gives you an S3-style
   access key id + secret and an account-scoped endpoint
   (`<account-id>.r2.cloudflarestorage.com`).
2. `cp .env.example .env` and fill in the R2 values. Leave `CORS_ORIGINS`
   empty (the SPA is same-origin in the container).

## Run

```sh
docker compose build
docker compose up -d
```

App is on `http://<host>:8000`. Put a reverse proxy / Cloudflare Tunnel in
front for TLS + a domain.

### Seeding from your current local DB

Your dev DB is at
`~/Library/Application Support/note-and-learn/note-and-learn.db`. To carry it
over, copy it into the volume before first start:

```sh
docker volume create note-and-learn_db
docker run --rm -v note-and-learn_db:/data -v "$HOME/Library/Application Support/note-and-learn":/src alpine \
  cp /src/note-and-learn.db /data/note-and-learn.db
```

(Or just let it start fresh — the migration + seed steps run on boot.)

## Auth

There is **none** — `user_id` is hardcoded to 1. Before exposing this
publicly, gate it: Cloudflare Access in front of the tunnel is the
zero-code option (allow only your Google login).

## Restoring a backup manually

```sh
docker compose run --rm --entrypoint "" app \
  litestream restore -config /etc/litestream.yml -o /data/restored.db /data/note-and-learn.db
```

## Local dev (unchanged)

`pnpm dev` (frontend, :5173) + the "Backend" VS Code debug config (:8000).
The debug config sets `CORS_ORIGINS` so the split-origin dev setup works;
production leaves it empty.
