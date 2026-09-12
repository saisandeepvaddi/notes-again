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
`note-and-learn_default` — then point the tunnel's origin at `http://app:8000`,
the compose service name, instead of `localhost`.)

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

Email/password login via **Firebase Auth**. The frontend gets an ID token; the
backend verifies it with the Firebase Admin SDK on every `/api` request. Only
users you create in the Firebase console can sign in — that console is the whole
user-management surface.

### Firebase setup

1. **Firebase console** → create a project (`console.firebase.google.com`).
2. **Build → Authentication → Get started → Sign-in method** → enable
   **Email/Password**.
3. **Authentication → Users → Add user** — your email + a password.
4. **Project settings → General → Your apps** → add a **Web app**; copy the SDK
   config into `.env`:

   ```sh
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<project-id>
   ```

   (These are client config, not secrets — they're compiled into the SPA.)
5. **Project settings → Service accounts → Generate new private key** → save the
   JSON as `./firebase-service-account.json` (git-ignored). `docker-compose.yml`
   mounts it read-only at `/run/secrets/firebase.json`, which is what
   `FIREBASE_CREDENTIALS_FILE` points at.
6. **Authentication → Settings → Authorized domains** — add your production
   hostname (e.g. `notes.example.com`).

### Behavior

The API returns 401 for any request without a valid Firebase token, so a direct
hit on the container is rejected even if the port leaks. `docker-compose.yml`
also binds the published port to `127.0.0.1` — point `cloudflared` (or your
reverse proxy) at `http://localhost:8000`.

A production build **fails** if `VITE_FIREBASE_*` are missing, so an
unauthenticated image can't ship by accident.

For local dev there is no Firebase in front: set `AUTH_DISABLED=1` (the `Backend`
VS Code debug config already does) and leave `VITE_FIREBASE_*` unset. Never set
`AUTH_DISABLED` in the container.

Data is still single-user (`user_id` hardcoded to 1) — Firebase just controls
who gets in.

## Restoring a backup manually

```sh
docker compose run --rm --entrypoint "" app \
  litestream restore -config /etc/litestream.yml -o /data/restored.db /data/note-and-learn.db
```

## Local dev (unchanged)

`pnpm dev` (frontend, :5173) + the "Backend" VS Code debug config (:8000).
The debug config sets `CORS_ORIGINS` so the split-origin dev setup works;
production leaves it empty.
