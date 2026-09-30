# Self-hosting Notes Again

Notes Again is one server process that serves both the app and its API, and
keeps everything in a single SQLite file. There are no other services to run
and no accounts to create elsewhere.

## Pick a setup

| You want to… | Use |
| --- | --- |
| Use it on this computer | [Run without Docker](#run-without-docker): `make run` |
| Run it on a home server or VPS | [Guided install](#guided-install): `./install.sh` |
| Run it with Docker, configured by hand | [Docker Compose](#docker-compose-by-hand) |
| Reach it from anywhere over HTTPS | Either Docker setup, plus a [reverse proxy or tunnel](#reaching-it-from-other-devices) |

Every setup signs in with a username and password by default, and keeps a
daily snapshot of the database. Off-site backup and Firebase sign-in are
optional extras.

## Run without Docker

Needs git, [uv](https://docs.astral.sh/uv/), Node 22+ and pnpm.

```sh
git clone https://github.com/saisandeepvaddi/notes-again && cd notes-again
make run
```

This installs dependencies, builds the frontend, and serves Notes Again on
<http://127.0.0.1:8000>. The first-launch password is printed in the same
terminal (see [First launch](#first-launch)).

- The database lives in the OS app-data folder
  (`~/Library/Application Support/notes-again/` on macOS,
  `~/.local/share/notes-again/` on Linux). Choose another path with
  `make run DB=/path/to/notes.db`.
- It is reachable from this computer only.
- `make run` always uses username and password sign-in, and ignores
  `AUTH_MODE`, `DB_PATH` and `FRONTEND_DIST` from your shell (those usually
  come from a Docker `.env`).
- To update: stop it, `git pull`, and `make run` again.

## Guided install

Needs git and Docker with Compose v2. On the server:

```sh
curl -fsSL https://raw.githubusercontent.com/saisandeepvaddi/notes-again/main/install.sh | sh
```

Or, from a clone: `./install.sh`.

The script clones the repo into `./notes-again` (or uses the checkout it's run
from), then asks:

1. Whether other devices on your network may open it, or only this machine and
   your reverse proxy or tunnel.
2. Which port to use (default 8000).
3. How to sign in: username and password, no login, or Firebase.
4. Whether to add off-site backup to S3-compatible storage.

It writes your answers to `.env`, builds the image from source, starts it, and
prints the address and the first-launch password. Run it again at any time to
change an answer: it only rewrites its own settings and keeps everything else
in `.env`.

## Docker Compose by hand

```sh
git clone https://github.com/saisandeepvaddi/notes-again && cd notes-again
docker compose up -d --build
```

No `.env` is needed. The app is on <http://localhost:8000>, reachable from this
machine only. Get the first-launch password with:

```sh
docker compose logs app | grep -A2 "first launch"
```

The database lives in the `db` Docker volume, mounted at `/data` in the
container. The image is always built from the source you cloned; nothing is
downloaded from a registry.

### Settings

Put settings in `.env` next to `docker-compose.yml`, then run
`docker compose up -d` again. [`.env.example`](../.env.example) lists them
with comments.

| Variable | Default | What it does |
| --- | --- | --- |
| `BIND_ADDRESS` | `127.0.0.1` | `0.0.0.0` lets other devices on the network connect |
| `HOST_PORT` | `8000` | Port on the host |
| `AUTH_MODE` | `local` | `local`, `none` or `firebase`; see [Sign-in](#sign-in) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | | Create the account with these instead of a temporary password (first start only) |
| `BACKUP_INTERVAL_HOURS` | `24` | How often to take a local snapshot; `0` turns snapshots off |
| `BACKUP_KEEP` | `7` | How many local snapshots to keep |
| `BACKUP_DIR` | `/data/backups` | Where local snapshots go |
| `BACKUP_REPLICA_URL` | | Turns on off-site backup; see [Backups](#off-site-backup-with-litestream) |
| `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` | | Credentials for off-site backup |

`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `LITESTREAM_ACCESS_KEY_ID` and
`LITESTREAM_SECRET_ACCESS_KEY` also accept a `_FILE` variant (for example
`ADMIN_PASSWORD_FILE=/run/secrets/admin_password`) that reads the value from a
file, for use with Docker secrets.

### Updating

```sh
make update
```

This runs `git pull --ff-only` and `docker compose up -d --build`. Your data
stays in the volume.

### Bringing an existing database

To start from a database you already have (a local `make run` database, a
download from Settings, or a snapshot), restore it into the volume before or
after the first start:

```sh
docker compose stop app
docker compose run --rm --entrypoint "" -v "/path/to/notes-again.db:/tmp/restore.db:ro" app \
  python backend/cli.py restore --yes /tmp/restore.db
docker compose up -d
```

## Sign-in

Choose with `AUTH_MODE`:

| `AUTH_MODE` | What it does |
| --- | --- |
| `local` (default) | Username and password stored in the database (scrypt-hashed). Signing in sets an HttpOnly session cookie. |
| `none` | No login. Only for a server nobody else can reach, or one behind a login you already run (VPN, reverse-proxy auth). |
| `firebase` | Firebase email/password sign-in. See [firebase-auth.md](firebase-auth.md). |

Firebase is used only with an explicit `AUTH_MODE=firebase`.

### First launch

The first start creates an `admin` account with a random password and prints
both in the server output. The message repeats on every start until setup is
finished. After you sign in, a setup screen asks you to choose:

- **Username & password**: set your own. Change them later in Settings → Sign-in.
- **No login**: turns login off. Turn it back on in Settings.
- **Firebase**: links to the Firebase guide. The server keeps using the
  temporary password until you restart it with `AUTH_MODE=firebase`.

### Locked out

Reset to a fresh temporary `admin` password. This also signs everyone out.

- Docker: `docker compose exec app python backend/cli.py reset-login`
- Without Docker: `make reset-login` (add `DB=...` if you use one)

### API tokens

The browser extension and other tools use a personal API token instead of a
login. Create one in Settings → API tokens; it's shown once. Tokens work in
every sign-in mode.

- A token can only save notes: list and create projects and tags, and create
  notes. It can't read, edit or delete notes, import, or manage tokens.
- Only a hash is stored. Revoking a token in Settings stops it immediately,
  and tokens can expire.
- In Firebase mode with `ALLOWED_EMAILS` set, tokens created by an address
  that is later removed from the list stop working.

## Reaching it from other devices

By default the app only accepts connections from the machine it runs on.

- **On your home network**: set `BIND_ADDRESS=0.0.0.0` (the guided install
  asks), then open `http://<server-ip>:8000`. Keep sign-in on.
- **From anywhere, over HTTPS**: keep the default `127.0.0.1` and put a
  reverse proxy (Caddy, nginx, Traefik) or a tunnel (Cloudflare Tunnel,
  Tailscale) in front, pointing at `http://localhost:8000`. Serve over HTTPS:
  the session cookie is only marked `Secure` when the request arrives over
  HTTPS, and API tokens are bearer credentials.

### Cloudflare Tunnel in its own container

If `cloudflared` runs as a separate Docker container, give it host networking:

```sh
docker run -d --name cloudflared --restart unless-stopped --network host \
  cloudflare/cloudflared:latest tunnel run --token <your-tunnel-token>
```

Without `--network host`, `localhost` inside the `cloudflared` container is
the container itself, not the app, and Cloudflare shows a 502 Bad Gateway.
Alternatively, attach `cloudflared` to the app's compose network (usually
`notes-again_default`) and point the tunnel at `http://app:8000`.

## Backups

Settings → Data & backups shows where the database file is, the latest
snapshot, and whether off-site backup is on. It also has **Download database**
(a consistent copy of the live file) and **Snapshot now**.

### Local snapshots

On by default. At startup and every 24 hours after, the server writes a copy of
the database to a `backups/` folder next to it (`/data/backups/` in Docker) and
keeps the last 7. The copy is taken with SQLite's `VACUUM INTO`, so it's safe
while the app runs. See [Settings](#settings) to change this.

Local snapshots sit on the same disk as the database, so they protect against
mistakes, not a lost disk. Copy one off the machine now and then, or add
off-site backup.

### Off-site backup with Litestream

Litestream streams every change to object storage. When the container starts
with an empty volume, it restores the latest copy before the app starts. It
runs only in the Docker image.

```sh
BACKUP_REPLICA_URL=s3://notes-again-backups/db?endpoint=<account-id>.r2.cloudflarestorage.com
LITESTREAM_ACCESS_KEY_ID=...
LITESTREAM_SECRET_ACCESS_KEY=...
```

- **Cloudflare R2**: create a bucket and an R2 API token with *Object Read &
  Write*; the token gives the key id and secret. Endpoint:
  `<account-id>.r2.cloudflarestorage.com`.
- **Backblaze B2**: `s3://<bucket>/db?endpoint=s3.<region>.backblazeb2.com`.
- **AWS S3**: `s3://<bucket>/db`.
- Other Litestream targets (SFTP, GCS, Azure) take their own URL schemes; see
  the [Litestream docs](https://litestream.io/reference/config/).

The older `R2_BUCKET` / `R2_PATH` / `R2_ENDPOINT` variables still work in place
of `BACKUP_REPLICA_URL`. Litestream 0.5 reads backups written by 0.3, so an
existing bucket carries over.

### Restoring

`restore` replaces the database with a snapshot or a downloaded `.db` file. It
checks the file first, and keeps the current database next to it as
`notes-again.db.before-restore-<time>`. Stop the server before restoring.

From a snapshot in the Docker volume:

```sh
docker compose stop app
docker compose run --rm --entrypoint "" app \
  python backend/cli.py restore /data/backups/notes-again-<time>.db
docker compose start app
```

From a file on the host, see [Bringing an existing database](#bringing-an-existing-database).

Without Docker: stop `make run`, then
`DB_PATH=<your db> backend/.venv/bin/python backend/cli.py restore <file>`.

From off-site, into a file you can inspect first (needs `BACKUP_REPLICA_URL`
in `.env`):

```sh
docker compose run --rm --entrypoint "" app \
  litestream restore -config /etc/litestream.yml -o /data/restored.db /data/notes-again.db
```

## Troubleshooting

Start with `doctor`. It prints the effective setup (sign-in mode, database,
frontend, backups) and lists likely mistakes:

- Docker: `docker compose exec app python backend/cli.py doctor`
- Without Docker: `make doctor`

Other maintenance commands in `backend/cli.py`: `reset-login`, `snapshot`,
`restore`. Without Docker they're also `make reset-login`, `make snapshot` and
`make doctor`, each taking `DB=...`.

- **Port already in use**: another program has port 8000. Set `HOST_PORT` in
  `.env` (Docker), or stop the other program.
- **Firebase errors on a machine that isn't set up for Firebase**: a Docker
  `.env` is probably loaded into your terminal (VS Code's Python extension
  does this by default). `make run` ignores those settings; running `uvicorn`
  yourself doesn't.
- **"Frontend not built"**: run `make build-frontend` (not needed with Docker
  or `make run`).

## Developing

For working on the code rather than running it: `make dev-backend` (port 8000,
login off) plus `make dev-frontend` (Vite with hot reload on port 5273). See
[AGENTS.md](../AGENTS.md) for the codebase layout and checks.
