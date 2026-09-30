# Deploying Notes Again

Single container: FastAPI serves the API **and** the prebuilt SPA on one port.
SQLite lives on a mounted volume; optionally, Litestream streams it to Cloudflare R2.

## What's in the box

- **Frontend** — TanStack Start built in SPA mode (`spa.enabled` in
  `frontend/vite.config.ts`). `pnpm build` emits `frontend/dist/client/`
  (`index.html` + `assets/`). No Node server at runtime.
- **Backend** — `uvicorn --app-dir backend main:app`. Serves `/api/*`, and
  everything else falls back to the SPA `index.html`.
- **DB** — `DB_PATH` env var (default `/data/notes-again.db`).
- **Backups** — `docker-entrypoint.sh` runs the app under
  `litestream replicate` when R2 creds are present, and restores from R2 on
  first boot if the volume is empty.

## One-time setup

Nothing is required: `docker compose up -d --build` works without a `.env`.
Sign-in defaults to a local username and password (see [Auth](#auth)).

Optional:

- **Backups to Cloudflare R2**: create a bucket (e.g. `notes-again-backups`)
  and an R2 API token with *Object Read & Write*. That gives you an S3-style
  access key id + secret and an account-scoped endpoint
  (`<account-id>.r2.cloudflarestorage.com`). `cp .env.example .env` and fill
  in the R2 values.
- Leave `CORS_ORIGINS` empty: the SPA is same-origin in the container.

## Run without Docker

Needs [uv](https://docs.astral.sh/uv/), Node 22+ and pnpm.

```sh
make run
```

This installs dependencies, builds the frontend into `frontend/dist/client`, and
starts the backend on http://127.0.0.1:8000, serving the API and the frontend
from one port. The database goes in the OS app-data folder
(`~/Library/Application Support/notes-again/` on macOS,
`~/.local/share/notes-again/` on Linux). Put it somewhere else with
`make run DB=/path/to/notes.db`. The first-launch password is printed in the
same terminal. It always uses username and password sign-in, and ignores
`AUTH_MODE`, `DB_PATH` and `FRONTEND_DIST` from your shell, since those usually
come from a container `.env` (VS Code's Python extension loads the repo-root
`.env` into its terminals).

## Run with Docker

```sh
docker compose up -d --build
```

App is on `http://<host>:8000`. Put a reverse proxy / Cloudflare Tunnel in
front for TLS + a domain.

### Cloudflare Tunnel as its own container

If you run `cloudflared` as a separate Docker container (rather than the
`cloudflared service install` systemd route), it **must** use
`--network host`:

```sh
docker run -d --name cloudflared --restart unless-stopped --network host \
  cloudflare/cloudflared:latest tunnel run --token <your-tunnel-token>
```

Without `--network host`, `cloudflared` lives in its own network namespace, so
the tunnel's origin config of `http://localhost:8000` points at *its own*
container — not the app — and Cloudflare shows a **502 Bad Gateway**
("Host Error"). `--network host` makes `localhost` inside `cloudflared`
resolve to the box's real network stack, i.e. the same `127.0.0.1:8000` that
`docker-compose.yml` publishes.

(Alternative: keep `cloudflared` off host networking and instead attach it to
the app's compose network — `docker network ls`, usually
`notes-again_default` — then point the tunnel's origin at `http://app:8000`,
the compose service name, instead of `localhost`.)

### Seeding from your current local DB

Your dev DB is at
`~/Library/Application Support/notes-again/notes-again.db`. To carry it
over, copy it into the volume before first start:

```sh
docker volume create notes-again_db
docker run --rm -v notes-again_db:/data -v "$HOME/Library/Application Support/notes-again":/src alpine \
  cp /src/notes-again.db /data/notes-again.db
```

(Or just let it start fresh — the migration + seed steps run on boot.)

## Auth

Pick one with `AUTH_MODE`:

| `AUTH_MODE` | What it does |
|---|---|
| `local` (default) | Username and password stored in the database (scrypt-hashed). Sign-in sets an HttpOnly session cookie. |
| `firebase` | Firebase email/password. See [docs/firebase-auth.md](docs/firebase-auth.md). |
| `none` | No login at all. Only for a server nobody else can reach. |

Firebase is only used with an explicit `AUTH_MODE=firebase`; a `FIREBASE_CREDENTIALS_FILE` on its own is ignored. `AUTH_DISABLED=1` still means `none` when `AUTH_MODE` is unset.

### First launch (local mode)

The first start creates an `admin` account with a random password and prints both to the logs:

```sh
docker compose logs app | grep -A3 "first launch"
```

The banner is printed again on every start until setup is finished. After signing in, a setup screen asks you to choose:

- **Username & password**: set your own. You can change them later in Settings → Sign-in.
- **No login**: turns login off. You can turn it back on in Settings.
- **Firebase**: links to the Firebase guide. The server keeps using the temporary password until you restart it with `AUTH_MODE=firebase`.

To skip the temporary password, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` before the first start. They are used only when the account is created, never afterwards.

### Locked out

Reset to a fresh temporary `admin` password. This also signs everyone out:

```sh
docker compose exec -w /app/backend app python -m local_auth.reset
```

Without Docker: `make reset-login`, which uses the same `DB_PATH` the server uses.

### Behavior

Every `/api` request without a valid session (or API token) gets a 401, so a direct hit on the container is rejected even if the port leaks. `docker-compose.yml` also binds the published port to `127.0.0.1`; point `cloudflared` or your reverse proxy at `http://localhost:8000`. Serve over HTTPS: the session cookie is marked `Secure` whenever the request arrives over HTTPS.

### API tokens (browser extension and other tools)

Tools that can't sign in interactively, such as the browser extension, use a
personal API token instead of a login. Tokens work in every auth mode. Create one in **Settings → API
tokens**; it is shown once, so copy it straight into the tool.

- A token can only save notes: list projects/tags, create projects/tags, create
  notes. It can't read, edit or delete notes, use import, or manage tokens.
- Only a hash is stored. Revoke a token in Settings and it stops working
  immediately; tokens can also expire.
- In Firebase mode with `ALLOWED_EMAILS` set, tokens minted by an address that
  is later removed from it stop working too.
- Tokens are bearer credentials: serve the API over HTTPS.

## Restoring a backup manually

```sh
docker compose run --rm --entrypoint "" app \
  litestream restore -config /etc/litestream.yml -o /data/restored.db /data/notes-again.db
```

## Local dev

For working on the code, not for running it: `make dev-backend` (:8000, login
off, CORS for the dev server) plus `make dev-frontend` (Vite with hot reload on
:5273). Production leaves `CORS_ORIGINS` empty.
