# Self-hosting Notes Again

Notes Again is one server process that serves both the app and its API, and
keeps everything in a single SQLite file. There are no other services to run
and no accounts to create elsewhere.

## Pick a setup

| You want to… | Use |
| --- | --- |
| Use it on this computer | [Run without Docker](#run-without-docker): `make run` |
| Run it on a home server or VPS | [Guided install](#guided-install): `./install.sh`, with Docker or without |
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
- It is reachable from this computer only, unless you change that in
  `.env.local`.
- `make serve` (or `scripts/serve.sh`, which doesn't need `make`) starts it
  again without reinstalling or rebuilding.
- To update: stop it, `git pull`, and `make run` again.

Settings for this setup live in `.env.local` in the repo folder, which the
[guided install](#guided-install) writes for you: `BIND_ADDRESS`, `HOST_PORT`,
`DB_PATH`, `AUTH_MODE` and the backup settings from [Settings](#settings).
Settings in your shell are ignored, because a Docker `.env` is often loaded
there (VS Code's Python extension does this by default).

## Guided install

Needs git, plus either Docker with Compose v2, or uv, Node.js 22+ and pnpm.
On the server:

```sh
curl -fsSL https://raw.githubusercontent.com/saisandeepvaddi/notes-again/main/install.sh | sh
```

Or, from a clone: `./install.sh`.

The script clones the repo into `./notes-again` (or uses the checkout it's run
from), then asks how to run it:

- **Docker** (the default when Docker is available): runs in a container that
  restarts on reboot, and can add off-site backup.
- **Directly on this machine**: runs with uv and Node, no containers. You
  start it with `scripts/serve.sh`.

Then it asks:

1. Whether other devices on your network may open it, or only this machine and
   your reverse proxy or tunnel.
2. Which port to use (default 8000).
3. Where the database lives (direct setup only).
4. How to sign in: username and password, no login, or Firebase.
5. Whether to add off-site backup to S3-compatible storage (Docker only).

It writes your answers to `.env` (Docker) or `.env.local` (direct), builds from
source, and prints the address and the first-launch password. The Docker setup
starts right away; the direct one offers to. Run the script again at any time
to change an answer: it only rewrites its own settings and keeps everything
else in the file.

If the chosen method is missing something, the script lists what to install
and stops without changing anything.

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
| `AUTH_MODE` | `local` | `local`, `none`, `firebase`, `proxy` or `cloudflare-access`; see [Sign-in](#sign-in) |
| `TRUSTED_PROXIES` | this machine | Addresses or networks of your reverse proxy, comma-separated; see [Reaching it from other devices](#reaching-it-from-other-devices) |
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

Choose with `AUTH_MODE`. **Most people should keep the default, `local`.**

| `AUTH_MODE` | Use it when |
| --- | --- |
| `local` (default) | Almost always. Notes Again asks for its own username and password (stored scrypt-hashed; signing in sets an HttpOnly session cookie). Works on its own, and behind any reverse proxy or tunnel. |
| `none` | The network is the lock: it runs on your own computer, or is reachable only over your VPN or Tailscale network. |
| `proxy` | You already put a login page in front of your self-hosted apps with Authelia, Authentik, oauth2-proxy or Tailscale Serve. See [Sign-in through your proxy](#sign-in-through-your-proxy). |
| `cloudflare-access` | You already protect this hostname with a Cloudflare Access application. See [Cloudflare Access](#cloudflare-access). |
| `firebase` | You want accounts managed in a Firebase project. See [firebase-auth.md](firebase-auth.md). |

Firebase is used only with an explicit `AUTH_MODE=firebase`.

### Why `proxy` and `cloudflare-access` exist

Some self-hosters sign in once, at the edge, for all their apps: a login
service (Authelia, Authentik, Cloudflare Access…) sits in front, and a
request only reaches the app after that login. Notes Again's own password is
then a second login on top of the first.

These two modes remove that second login: Notes Again trusts the identity the
login in front has already checked, and Sign out goes through it too. They
don't add security; the login in front provides it. If you don't already run
such a login, you don't need them, and `local` works fine behind any proxy or
tunnel.

A Cloudflare Tunnel on its own is not a login: it only carries traffic to your
server, and anyone with the address reaches the app. With just a tunnel, keep
`local`. Use `cloudflare-access` only once a Cloudflare Access application
shows its own login page for that hostname.

`ALLOWED_EMAILS` (comma-separated) limits who gets in with `firebase`,
`proxy` and `cloudflare-access`, even if the provider lets more people sign in.
In `proxy` mode it is compared with the header value.

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

### Sign-in through your proxy

With `AUTH_MODE=proxy`, Notes Again trusts a username header set by your
reverse proxy after it has signed the person in.

| Variable | Default | |
| --- | --- | --- |
| `AUTH_PROXY_HEADER` | `Remote-User` | Header with the username, e.g. `Tailscale-User-Login` for Tailscale Serve |
| `AUTH_PROXY_LOGOUT_URL` | | Where Sign out sends people; without it, there's no Sign out button |
| `TRUSTED_PROXIES` | this machine | Only requests from these addresses may set the header |

The header is ignored unless the request comes straight from a trusted proxy
address, so nobody can set it themselves by reaching the app directly. In the
Docker setup with the default loopback binding, proxies on the same machine
are trusted automatically. If the proxy runs elsewhere, or you set
`BIND_ADDRESS=0.0.0.0`, set `TRUSTED_PROXIES` to its address. Never set it to
`*`.

The browser extension's requests carry an API token, not a proxy login; let
requests to `/api/` that have an `Authorization: Bearer nal_…` header through
your proxy without its login step. Notes Again still checks the token.

### Cloudflare Access

With `AUTH_MODE=cloudflare-access`, Notes Again checks the signed token that
Cloudflare Access adds to every request, so it's safe even if someone reaches
the server another way.

1. In the Cloudflare Zero Trust dashboard, add a self-hosted Access application
   for the hostname that serves Notes Again (usually through a Cloudflare
   Tunnel), with a policy for who may sign in.
2. Copy the application's **Audience (AUD) tag**, and your team domain
   (`<team>.cloudflareaccess.com`).
3. Set:

   ```sh
   AUTH_MODE=cloudflare-access
   CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com
   CF_ACCESS_AUD=<audience tag>
   ```

Sign out goes to Cloudflare's `/cdn-cgi/access/logout`. For the browser
extension, add a second Access policy with the **Bypass** action for the
`/api/` path: extension requests carry an API token, which Notes Again checks,
and the app's own requests still need a valid Access sign-in.

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

Notes Again reads the client address and `https` from the proxy's
`X-Forwarded-For` and `X-Forwarded-Proto` headers only when the request comes
from `TRUSTED_PROXIES`. That list defaults to this machine; in Docker with the
default loopback binding it also covers proxies on the host. A proxy on another
machine needs its address in `TRUSTED_PROXIES`.

If your proxy or tunnel can sign people in, it can replace Notes Again's own
login: see [Sign-in through your proxy](#sign-in-through-your-proxy) and
[Cloudflare Access](#cloudflare-access).

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
  `.env` (Docker) or `.env.local` (direct), or stop the other program.
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
