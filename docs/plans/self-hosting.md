# Plan: simpler self-hosting

Status: proposal. Branch: `simplify-self-hosting`.

Done so far: `AUTH_MODE` with `local` (default), `firebase` and `none`, runtime Firebase config, an argument-free `docker build`, the first-launch setup screen, `make run` (Tier 0), the Settings → Data & backups panel, daily local snapshots, database download, Litestream 0.5.17 with `BACKUP_REPLICA_URL`, and `backend/cli.py` (`reset-login`, `snapshot`, `restore`, `doctor`). Not done from phases 1–3: `_FILE` variants for secrets, and showing whether the server is bound to loopback. First launch works differently from what section 2 proposed: instead of a setup code, it creates an `admin` account with a random password printed to the logs, and after that sign-in the owner picks username/password, no login, or Firebase (which links to `docs/firebase-auth.md`). Everything else below is still to do.

## Problem

Getting Notes Again running today means all of this, in this order:

1. Create a Firebase project, enable email/password, add a user, turn sign-up off, add an authorized domain.
2. Download a service-account JSON and place it where compose mounts it.
3. Copy three `VITE_FIREBASE_*` values into `.env`.
4. Create an R2 bucket and token, copy four more values.
5. Build the image yourself, because the Firebase config is compiled into the SPA (`Dockerfile` build args, `frontend/src/lib/firebase.ts` throws in a production build without it).

None of this is optional in practice:

- `backend/auth.py` raises at import unless `FIREBASE_CREDENTIALS_FILE` or `AUTH_DISABLED=1` is set.
- A production frontend build throws without Firebase config, so there is no image anyone else can pull.
- `docker-compose.yml` mounts `./firebase-service-account.json` unconditionally, so compose fails if the file is missing.
- Backups are already optional in `docker-entrypoint.sh`, but `.env.example` and `DEPLOY.md` present them as part of setup.

The bare-minimum case (one person, one laptop, `localhost`) needs none of it, and neither do most home-server setups.

## What other self-hosted apps do

| App | How you get it running | First login | Other auth options | Backups |
|---|---|---|---|---|
| Uptime Kuma | One `docker run` line, or a compose file fetched with `curl` | Setup page in the UI on first visit | None built in | Copy the `/app/data` volume |
| Memos | One `docker run` line, data dir mounted | The first account to sign up becomes admin | OAuth/OIDC SSO, sign-up can be disabled | Copy one SQLite file |
| PocketBase | Single binary | Prints a one-time installer link to the terminal; also `pocketbase superuser create` | OAuth2 providers | Copy `pb_data` |
| linkding | One `docker run` line | `LD_SUPERUSER_NAME` / `LD_SUPERUSER_PASSWORD`, or a `createsuperuser` command | `LD_ENABLE_AUTH_PROXY` + a username header (Authelia and similar); OIDC; `LD_DISABLE_LOGIN_FORM` | Copy the volume |
| Miniflux | Package, binary or container | `ADMIN_USERNAME` / `ADMIN_PASSWORD`, plus `_FILE` variants for Docker secrets | `AUTH_PROXY_HEADER` + `TRUSTED_REVERSE_PROXY_NETWORKS`; OIDC discovery URL | Postgres dump |
| Paperless-ngx | Interactive install script (recommended), compose templates, or bare metal | The script creates the superuser; otherwise the UI prompts on first visit | Remote-user header, social/OIDC | Built-in document exporter |
| Immich | `curl … install.sh \| bash` downloads compose and `.env`, then starts (marked experimental); compose is the recommended path | Admin sign-up on first visit | OAuth/OIDC | Built-in scheduled DB dumps |
| Actual Budget | Desktop app, local web app, Docker, CLI server, and one-click hosts (PikaPods, Fly.io) | Set a server password on first visit | OpenID | The desktop app backs up automatically |
| Vaultwarden | One `docker run` line | Open sign-up, then `SIGNUPS_ALLOWED=false` | `/admin` panel gated by `ADMIN_TOKEN` | Documented copy/sqlite backup |

What they have in common:

1. **A prebuilt image and a one-line start.** Nobody builds from source to try the app. Config is read at runtime, never baked in at build time.
2. **Zero-config first run, with a login you create in the app.** Either a setup screen on first visit (Uptime Kuma, Actual, Immich), an env-seeded admin (linkding, Miniflux), or a one-time link printed to the logs (PocketBase). No third-party account is required.
3. **Auth has tiers.** Built-in password by default. Trusted-header/proxy auth for people who already run Authelia, Authentik, Cloudflare Access or Tailscale. OIDC for people who want SSO. Hosted-identity products like Firebase are rare.
4. **Secrets can come from files** (`*_FILE`) so they work with Docker secrets.
5. **Backups start as "it's one file, copy it,"** with a built-in scheduled dump or export on top. Streaming replication is an advanced add-on.
6. **An install script is a convenience layer over compose, not a replacement.** Paperless and Immich both still document plain compose. Scripts ask a few questions, write `.env` and compose, pull and start.
7. **Platform reach comes from templates, not code:** Unraid Community Apps, CasaOS/Umbrel/YunoHost stores, Coolify/Dokploy/Railway templates, PikaPods. Each is a small manifest that points at the published image.

Where this plan differs on purpose: there is **no published image**. Many self-hosters would rather not run an image built by someone else, so every path builds from the cloned source (`docker compose up --build`), and the one-click platforms build from the repo's `Dockerfile` too. The lesson we keep from point 1 is the one that matters: config is read at runtime, so the build takes no arguments and a plain `docker build .` always works.

## Target experience

Three tiers. Each one adds to the previous without changing it.

### Tier 0: local, no Docker

```sh
git clone … && cd notes-again
make run            # builds the SPA once, serves on http://127.0.0.1:8000
```

- No auth (`AUTH_MODE=none`), bound to `127.0.0.1` only.
- DB in the OS app-data dir, which is what `get_sqlite_db_file_path()` already does.
- Settings → System shows the DB file path, size, and a "Reveal/Copy path" and "Download a copy" button.

### Tier 1: server with Docker, built from source

```sh
git clone https://github.com/saisandeepvaddi/notes-again && cd notes-again
docker compose up -d --build
```

- The image is built locally from the cloned source. No `.env` and no key files are needed to start.
- Update with `git pull && docker compose up -d --build` (wrapped as `make update`).
- First visit shows a "Set a password" screen, protected by a one-time setup code printed in the container logs (PocketBase-style), so a publicly reachable instance can't be claimed by someone else first.
- Or skip the screen with `ADMIN_PASSWORD` / `ADMIN_PASSWORD_FILE`.
- Backups: automatic local snapshots into `/data/backups`, no configuration.

### Tier 2: guided install with extras

```sh
curl -fsSL https://raw.githubusercontent.com/saisandeepvaddi/notes-again/main/install.sh | bash
```

Clones the repo into `./notes-again` (or uses the current checkout when run as `./install.sh`), asks a few questions, writes `.env` and a `compose.override.yaml`, builds, starts, and prints the URL and setup code:

1. Port (default 8000), and whether to bind to localhost only (behind a proxy/tunnel) or all interfaces.
2. Login: built-in password (default) / reverse-proxy header / Cloudflare Access / Firebase / none.
3. Off-site backups: none (default) / S3-compatible (R2, B2, AWS, MinIO) / SFTP.

Everything the script writes can also be written by hand. The script only saves typing.

## Design

### 1. Runtime config, argument-free build

- Add an unauthenticated `GET /api/public/config` returning `{ authMode, firebase?: {apiKey, authDomain, projectId}, version }`. It is mounted outside the `require_user` router.
- The frontend fetches it before rendering `AuthGate`. `firebase.ts` stops reading `import.meta.env.VITE_FIREBASE_*` and initializes from that response. The Firebase SDK moves behind a dynamic `import()` so other modes don't download it.
- Remove the Firebase build args from `Dockerfile` and `docker-compose.yml`, and delete the "throw in production without Firebase" check. The safety it provided moves to the backend (section 2).
- Make the Firebase key-file mount optional in compose: move it into an override file that only the Firebase setup uses.
- A plain `docker build .` must succeed with no arguments and no `.env`. The one-click platforms in section 7 depend on this.

### 2. Auth modes

One variable, `AUTH_MODE`, replaces the implicit Firebase-or-disabled switch:

| Mode | Who it's for | How it works |
|---|---|---|
| `password` (default in the container) | Most people | Single owner password, stored hashed (`hashlib.scrypt`, stdlib) in a new table. Login sets an HttpOnly, `SameSite=Lax` session cookie signed with a key auto-generated into `/data/secret_key` on first boot. Login is rate-limited. |
| `none` | Tier 0, or behind a proxy that already does auth | No login. The backend logs a warning, and the UI shows a small banner, when it is bound to anything other than loopback. |
| `proxy` | Authelia, Authentik, Tailscale Serve, oauth2-proxy | Trust a username header (`AUTH_PROXY_HEADER`, e.g. `Remote-User`, `Tailscale-User-Login`) only from `TRUSTED_PROXIES`. Same pattern as linkding and Miniflux. |
| `cloudflare-access` | People already using Cloudflare Tunnel (this deployment) | Verify the `Cf-Access-Jwt-Assertion` JWT against the team's public keys (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`). No header trust, no Firebase. |
| `firebase` | Existing deployment | Current behaviour, but config comes from runtime env. |

Details:

- Firebase is opt-in only: it needs `AUTH_MODE=firebase`. `AUTH_DISABLED=1` still means `none` when `AUTH_MODE` is unset, for dev and test tooling. Existing Firebase deployments add `AUTH_MODE=firebase` to their `.env`.
- API tokens (`nal_…` bearer) keep working in every mode, so the extension is unaffected.
- `ALLOWED_EMAILS` applies to the modes that produce an email (`firebase`, `cloudflare-access`, `proxy` when the header carries one). `ApiToken.created_by` is nullable already, which suits password mode.
- Password recovery goes through a CLI inside the container, not email: `docker exec notes-again notes-again reset-password`.
- Misconfiguration produces one clear log line and a non-zero exit, instead of the current `RuntimeError` at import.
- OIDC is deferred. `proxy` plus oauth2-proxy, or `cloudflare-access`, covers SSO until someone asks for it.

### 3. Backups as layers

1. **Always on: local snapshots.** A background task writes `VACUUM INTO /data/backups/notes-again-YYYYMMDD.db` daily and keeps the last N (`BACKUP_KEEP`, default 7). SQLite does this safely while the app runs. `BACKUP_INTERVAL=0` turns it off.
2. **Manual: download.** Settings → System gets a "Download database" button that streams a fresh `VACUUM INTO` copy. The existing JSON export stays as the portable format.
3. **Optional: off-site streaming.** Keep Litestream, upgrade 0.3.13 → 0.5.x (its config changes from `replicas:` to a single `replica:`), and configure it with one URL instead of four provider-specific vars:
   `BACKUP_REPLICA_URL=s3://bucket/path?endpoint=https://<acct>.r2.cloudflarestorage.com` plus `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY`. This works for R2, B2, AWS, MinIO, and SFTP/GCS/Azure through their URL schemes. The entrypoint keeps its "only if configured" behaviour, and `R2_*` keeps working for one release.

### 4. Settings → System panel

A new session-only endpoint, `GET /api/system` (API tokens get 403, like tokens management), and a section in Settings showing:

- DB file path (copyable), file size, SQLite version, note count.
- App version and commit.
- Auth mode, and whether the server is bound to loopback.
- Backups: last local snapshot time and location, whether off-site replication is configured, and Litestream's last sync if cheaply available.
- Actions: Download database, Export JSON (existing), Snapshot now.

In a container the path reads `/data/notes-again.db`. The panel adds a note that this path is inside the `/data` volume.

### 5. Setup tooling

- `make run`: build the SPA if `frontend/dist` is stale, then start uvicorn on `127.0.0.1:8000` with `AUTH_MODE=none`.
- `install.sh` at the repo root: POSIX sh, idempotent, re-runnable to change answers. It checks for Docker, never runs `sudo` on its own, and writes files you can read and edit.
- `notes-again` CLI in the container, a small `argparse` entry point in `backend/`: `reset-password`, `snapshot`, `restore <file>`, `doctor` (prints the effective config and checks for common mistakes: volume not mounted, proxy mode without trusted proxies, Litestream creds without a URL).
- Every secret env var also accepts a `_FILE` variant.

### 6. Docs and templates

- Rewrite `DEPLOY.md` into `docs/self-hosting.md`, starting with a decision table ("Just me on my laptop" → Tier 0, "Home server/VPS" → Tier 1, "Public domain with SSO/backups" → Tier 2, "I don't want to run a server" → section 7). The Firebase and Cloudflare Tunnel sections move to a separate "Advanced" page.
- `.env.example` shrinks to the handful of vars most people touch. Everything else goes in a reference table.
- Replace the root `README.md` (TanStack boilerplate) with a real one: screenshot, the clone + `docker compose up -d --build` quick start, links to the docs, and (after phase 6) the deploy buttons.
- Coolify and Dokploy can deploy a compose file straight from a git repo, so they need only a short docs page, not a template. Unraid, CasaOS and Umbrel stores expect a published image, so they are out of scope while there isn't one.

### 7. One-click deploy buttons

The platform clones the repo and builds the `Dockerfile` itself, so this fits the no-published-image rule.

The hard constraint is SQLite: the platform must give the container a **persistent disk**. Platforms whose filesystem resets on every deploy would silently lose every note.

| Platform | Button / entry point | Config file in repo | Persistent disk | Verdict |
|---|---|---|---|---|
| Railway | `railway.com/new/template/<code>` button | Template made once in Railway's template composer (GitHub repo source + volume at `/data`), plus `railway.json` for build settings | Yes (volume) | Support |
| Render | `render.com/deploy?repo=…` button | `render.yaml` blueprint: Docker runtime, `disk` mounted at `/data` | Yes, paid instances only; a disk means one instance and no zero-downtime deploys, which is fine for a single-user app | Support; README says a paid plan is needed |
| Fly.io | No hosted button; `fly launch --from https://github.com/saisandeepvaddi/notes-again` | `fly.toml` with `[mounts]` at `/data` and one machine | Yes (volume) | Support as a documented one-liner |
| Zeabur, Koyeb, Northflank | Deploy buttons / templates | Varies | Check per platform | Investigate after the three above |
| Vercel, Netlify | Deploy buttons | — | No: serverless, read-only filesystem; Vercel's own docs say SQLite isn't supported | Not supported |
| DigitalOcean App Platform, Heroku, Google Cloud Run | Deploy buttons | — | No: filesystem resets on each deploy | Not supported (see below) |

Requirements the app must meet first (all delivered by phases 1–3):

- `docker build .` works with no arguments (phase 1).
- Listens on `$PORT`. `docker-entrypoint.sh` already does this.
- Safe on a public URL from the first second: `password` mode is the default, and the setup code is visible in the platform's log viewer. Templates that can generate secrets (Render `generateValue`, Railway generated variables) can set `ADMIN_PASSWORD` directly instead, and the README tells people where to read it.
- HTTPS is terminated by the platform, so the session cookie's `Secure` flag must follow `X-Forwarded-Proto` (run uvicorn with `--proxy-headers` and trusted forwarded IPs).
- `/healthz` is used as each platform's health check.
- Each platform's config pins exactly one instance, because SQLite can't be shared by two writers.

Ephemeral platforms (DigitalOcean App Platform, Cloud Run with max instances set to 1) could technically work with Litestream restoring on boot and replicating continuously. But during a deploy the old and new containers overlap, and writes made in the last seconds before shutdown can be lost. That's not a safe default for someone's notes. Leave them unsupported unless someone asks, and then document them as "requires off-site replication, at your own risk".

Deliverables: `render.yaml`, `fly.toml`, `railway.json` plus the published Railway template, a "Deploy" section in the README with the buttons, and one docs page per platform covering cost, where to find the setup code, how to update, and how to download a backup.

## Phases

Each phase ships on its own and leaves the current deployment working.

1. **Runtime config, argument-free build.** `/api/public/config`, frontend reads it, Firebase build args and the unconditional key-file mount removed, `AUTH_MODE` with `none` + `firebase` and backward-compatible inference. *Result: `git clone && docker compose up -d --build` works with no `.env`, using `AUTH_MODE=none`.*
2. **Built-in password + System panel.** Password mode with setup screen and setup code, session cookies, `reset-password` CLI, `/api/system` and the Settings panel, `make run`. `password` becomes the default in the container.
3. **Backups.** Local snapshots, download button, Litestream 0.5 with `BACKUP_REPLICA_URL`, `snapshot`/`restore`/`doctor` CLI.
4. **Installer and docs.** `install.sh`, `make update`, slimmer compose and `.env.example`, `docs/self-hosting.md`, new README.
5. **More auth modes (optional).** `proxy` and `cloudflare-access`, plus the Coolify/Dokploy docs page.
6. **One-click deploys.** Railway, Render and Fly.io configs, buttons and docs pages (section 7). Then look at Zeabur, Koyeb and Northflank.

Tests to add along the way: backend pytest per auth mode (header trust only from trusted proxies, token scopes unchanged in every mode, setup code single-use); a Playwright spec for password setup and login, run with a second backend config. For phase 6, one manual deploy per platform, checking that a note survives a redeploy.

## Decisions for you

1. **Keep Firebase?** Recommendation: keep it as a mode in phases 1–4 so your deployment doesn't move, and consider switching yourself to `cloudflare-access` (you already run a Tunnel) or `password`. If you do switch, drop Firebase and its dependencies later.
2. **Default mode in the container:** `password` (recommended, safe when exposed, required for the one-click platforms) or `none` (simplest, risky).
3. **Railway template ownership:** a Railway template is published from someone's Railway account, and that account appears as the author. It has to be yours.

Decided: no published image or registry, and no Python package for now. Everything builds from source.

## Sources

- [linkding options](https://linkding.link/options/)
- [Miniflux configuration](https://miniflux.app/docs/configuration.html)
- [Paperless-ngx setup](https://docs.paperless-ngx.com/setup/)
- [Immich install script](https://docs.immich.app/install/script)
- [Actual Budget install](https://actualbudget.org/docs/install/)
- [Uptime Kuma README](https://github.com/louislam/uptime-kuma)
- [PocketBase docs](https://pocketbase.io/docs/)
- [Memos getting started](https://usememos.com/docs/getting-started)
- [Litestream config reference](https://litestream.io/reference/config/)
- [Deploy to Render button](https://render.com/docs/deploy-to-render) and [Render persistent disks](https://render.com/docs/disks)
- [Railway deploy button](https://docs.railway.com/guides/publish-and-share)
- [fly launch --from](https://docs.fly.io/flyctl/launch/)
- [Deploy to Koyeb button](https://www.koyeb.com/docs/build-and-deploy/deploy-to-koyeb-button)
- [DigitalOcean deploy button](https://docs.digitalocean.com/products/app-platform/how-to/add-deploy-do-button/) and [App Platform storage](https://docs.digitalocean.com/products/app-platform/how-to/store-data/)
- [Is SQLite supported in Vercel?](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
