# Notes Again

Personal, self-hosted spaced-repetition app: freeform markdown notes organized into projects and tags, resurfaced for review on an SM2/FSRS schedule. Single user per deployment.

- Product intent and audience: [PRODUCT.md](PRODUCT.md)
- Visual system (colors, type, components): [DESIGN.md](DESIGN.md)
- Running and self-hosting (make run, install.sh, Docker, sign-in, backups): [docs/self-hosting.md](docs/self-hosting.md)
- Brand icons: `assets/` holds the source artwork. `node scripts/build-icons.mjs` (uses the frontend's Playwright Chromium) renders every platform variant into `frontend/public/`, `extension/public/icon/` and `mobile/assets/images/`; edit the sources and rerun rather than editing the generated files.
- `README.md` is the public overview; `install.sh` is the guided Docker installer (POSIX sh, test changes under `dash`).

## Layout

- `backend/`: FastAPI + SQLModel + SQLite, managed with uv (`backend/.venv`). One router package per domain (`notes`, `tags`, `projects`, `settings`, `imports`, `tokens`), all mounted under `/api` behind `require_user` in `api.py`.
- `frontend/`: TanStack Start in SPA mode (built to static files, served by FastAPI in production), TanStack Router file routes, TanStack Query, shadcn on Base UI (not Radix), Tailwind v4, Zod v4. Before editing TanStack code, run the matching guidance command listed in [frontend/AGENTS.md](frontend/AGENTS.md).
- `extension/`: WXT browser extension for capture. It is its own pnpm root; see [extension/README.md](extension/README.md).
- `mobile/`: Expo (React Native) app for review and capture on phones, its own pnpm root. It imports pure modules from `frontend/src` through the `@web/*` alias (Zod schemas, rating/difficulty options, `markdownExcerpt`, the QR sign-in link format in `settings/api-tokens/connectLink.ts`), so those files must stay free of `@/` imports and DOM or web-only dependencies. See [mobile/AGENTS.md](mobile/AGENTS.md).

## Running locally

- As a user would: `make run` builds the SPA and serves it from the backend via `scripts/serve.sh`, which ignores shell auth/DB/port variables and reads `.env.local` instead (defaults 127.0.0.1:8000, local sign-in; `make run DB=...` for a throwaway database).
- Backend: `AUTH_DISABLED=1 CORS_ORIGINS=http://localhost:5273 backend/.venv/bin/uvicorn --app-dir backend main:app --reload`. The repo-root `.env` holds container/production values (`DB_PATH=/data/...`, secrets); keep it out of local runs. With `DB_PATH` unset, the DB lives in the OS app-data dir (`~/Library/Application Support/notes-again/` on macOS).
- Frontend: `pnpm dev` in `frontend/` (port 5273). The API defaults to the host you opened the app on, port 8000; `VITE_SERVER_IP`/`VITE_SERVER_PORT` in an optional `frontend/.env` override it. A stale `VITE_SERVER_IP` (an old LAN address) is the usual cause of a forever-spinning UI: requests time out after 10s with an error naming the address they tried. The login screen follows whatever auth mode the backend reports at `/api/auth/status`, so `AUTH_DISABLED=1` on the backend means no login in dev.

## Verifying changes

- Frontend: `pnpm typecheck`, `pnpm lint` (oxlint), `pnpm test` (vitest unit tests in `frontend/tests/` for pure modules; keep UI flows in E2E).
- Backend: `.venv/bin/ruff check .`, `.venv/bin/python -m pytest` (from `backend/`).
- Extension: `pnpm typecheck`, `pnpm test`.
- Mobile: `pnpm typecheck`, `pnpm lint` (oxlint), `pnpm doctor` after dependency changes.
- E2E: `make test-e2e`. Playwright starts its own backend (8210) and frontend (5290) on a throwaway DB. Specs share that DB and run serially, so seed data with `uniqueName()` from `e2e/support/api.ts`. The first run on a cold Vite server is slow and can time out once.
- The formatters (oxfmt, `ruff format`) have never been applied repo-wide. Run them only on files you touch, so diffs stay limited to your change.

## Conventions

- Code carries no comments. Tool directives stay because they change behaviour: `eslint-disable`, `@ts-*`, `/// <reference>`, `# type: ignore`, `// @vitest-environment`.
- Schema changes: there is no migration tool. A new column on an existing table must also be added to `add_missing_columns` in `backend/db/setup.py`, or existing databases break.
- Single user: rows default to `user_id=1`.
- Backups: `backups/service.py` takes `VACUUM INTO` snapshots on a schedule started in `main.py`'s lifespan (tests set `BACKUP_INTERVAL_HOURS=0`). Maintenance commands live in `backend/cli.py` (`reset-login`, `snapshot`, `restore`, `doctor`, `reindex`).
- Search: `notes_fts` is an FTS5 trigram index over `notes.name`/`notes.content`, kept in sync by SQLite triggers created in `search/index.py` (`ensure_search_index`), so any write path stays indexed without app code. Both `/api/search` and the notes list `search` param match through `search/query.py`.
- Auth: `AUTH_MODE` is `local` (default; username/password in the `local_auth` table, HttpOnly session cookie backed by `auth_sessions`), `firebase` (runtime web config from `VITE_FIREBASE_*` on the backend), `proxy` (username header, trusted only from `TRUSTED_PROXIES`), `cloudflare-access` (verifies the Access JWT; `external_auth.py`), or `none`. `ALLOWED_EMAILS` applies to firebase, proxy and cloudflare-access. Uvicorn runs with `--no-proxy-headers`; `trusted_proxies.ForwardedHeadersMiddleware` records the real peer and applies `X-Forwarded-*` itself. Firebase needs an explicit `AUTH_MODE=firebase`; unset `AUTH_MODE` means `local`, or `none` with `AUTH_DISABLED=1`. In local mode the owner can also turn login off from the UI. `/api/auth/*` is public; everything else under `/api` goes through `require_user`. Firebase setup lives in [docs/firebase-auth.md](docs/firebase-auth.md).
- API tokens are scoped. The extension's `capture` tokens can only list/create projects and tags and create notes. `app` tokens (the mobile app) can call everything except token management and `/api/system`, which `require_session_user` keeps to real sessions. In local mode `POST /api/auth/token` trades a username and password for an `app` token, and `DELETE /api/auth/token` revokes the caller's own token.
- Scheduling: each note stores its own `algorithm` (`sm2` or `fsrs`); new notes follow `Settings.default_algorithm` (defaults to `fsrs`).
- Review status: a note is In review, Paused (`paused_at` set), or Note only (`in_review` false: no pending reminder, never paused, past reviews kept). Move notes between them with `remove_from_review` / `add_to_review` in `backend/notes/bulk.py` so that holds. Labels and the `active | paused | note-only` values live in `frontend/src/notes/reviewStatus.ts`, shared with mobile.
- Command palette: `frontend/src/command-palette/`, opened with `Cmd/Ctrl+/` (and `Cmd/Ctrl+K` outside the editor, where it would clash with insert-link). Pages add context commands with `usePageCommands` (memoize the array). Search results live under `["notes", "search", q]`, so existing `["notes"]` invalidations keep them fresh.
- Query cache families: `["notes"]`, `["due-notes"]`, `["trashed-notes"]`, `["projects"]`, `["tags"]`, `["auth-status"]`, `["system"]`. Mutations invalidate by prefix.

## URL state on the notes list

- Everything that shapes `/notes` (tag, project, date as `yyyy-MM-dd`, `q`, status, sort, order, page, pageSize) is a search param validated by `notesSearchSchema` in `frontend/src/notes/notes-list/notesSearch.ts`. New list state goes into that schema, not `useState`, so back/forward and reload restore it.
- Zod v4 schemas are passed to `validateSearch` directly, each field ending in `.catch(undefined)`; `@tanstack/zod-adapter` is not used.
- Update params with `search: (prev) => ({ ...prev, ... })` so other filters survive.
- A search middleware on the route drops `page` whenever a filter changes.
- "Back to list" targets (the note page's All Notes link, the redirect after delete) use `lastNotesSearch()`. The sidebar entry stays unfiltered.
- Per-viewer display preferences (grid/table view mode) live in localStorage, not the URL.
