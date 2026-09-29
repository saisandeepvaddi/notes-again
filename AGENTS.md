# Notes Again

Personal, self-hosted spaced-repetition app: freeform markdown notes organized into projects and tags, resurfaced for review on an SM2/FSRS schedule. Single user per deployment.

- Product intent and audience: [PRODUCT.md](PRODUCT.md)
- Visual system (colors, type, components): [DESIGN.md](DESIGN.md)
- Docker, Litestream, R2, production env: [DEPLOY.md](DEPLOY.md)
- `README.md` is leftover TanStack starter boilerplate; ignore it.

## Layout

- `backend/`: FastAPI + SQLModel + SQLite, managed with uv (`backend/.venv`). One router package per domain (`notes`, `tags`, `projects`, `settings`, `imports`, `tokens`), all mounted under `/api` behind `require_user` in `api.py`.
- `frontend/`: TanStack Start in SPA mode (built to static files, served by FastAPI in production), TanStack Router file routes, TanStack Query, shadcn on Base UI (not Radix), Tailwind v4, Zod v4. Before editing TanStack code, run the matching guidance command listed in [frontend/AGENTS.md](frontend/AGENTS.md).
- `extension/`: WXT browser extension for capture. It is its own pnpm root; see [extension/README.md](extension/README.md).

## Running locally

- Backend: `AUTH_DISABLED=1 CORS_ORIGINS=http://localhost:5273 backend/.venv/bin/uvicorn --app-dir backend main:app --reload`. The repo-root `.env` holds container/production values (`DB_PATH=/data/...`, secrets); keep it out of local runs. With `DB_PATH` unset, the DB lives in the OS app-data dir (`~/Library/Application Support/notes-again/` on macOS).
- Frontend: `pnpm dev` in `frontend/` (port 5273). `frontend/.env` sets `VITE_SERVER_IP`/`VITE_SERVER_PORT` for the API; empty `VITE_FIREBASE_*` vars disable the login screen in dev (a production build throws without them).

## Verifying changes

- Frontend: `pnpm typecheck`, `pnpm lint` (oxlint).
- Backend: `.venv/bin/ruff check .`, `.venv/bin/python -m pytest` (from `backend/`).
- Extension: `pnpm typecheck`, `pnpm test`.
- E2E: `make test-e2e`. Playwright starts its own backend (8210) and frontend (5290) on a throwaway DB. Specs share that DB and run serially, so seed data with `uniqueName()` from `e2e/support/api.ts`. The first run on a cold Vite server is slow and can time out once.
- The formatters (oxfmt, `ruff format`) have never been applied repo-wide. Run them only on files you touch, so diffs stay limited to your change.

## Conventions

- Code carries no comments. Tool directives stay because they change behaviour: `eslint-disable`, `@ts-*`, `/// <reference>`, `# type: ignore`, `// @vitest-environment`.
- Schema changes: there is no migration tool. A new column on an existing table must also be added to `add_missing_columns` in `backend/db/setup.py`, or existing databases break.
- Single user: rows default to `user_id=1`. Auth is Firebase plus an optional `ALLOWED_EMAILS` allowlist; `AUTH_DISABLED=1` bypasses it.
- API tokens are scoped. The extension's `capture` tokens can only list/create projects and tags and create notes.
- Scheduling: each note stores its own `algorithm` (`sm2` or `fsrs`); new notes follow `Settings.default_algorithm` (defaults to `fsrs`).
- Query cache families: `["notes"]`, `["due-notes"]`, `["trashed-notes"]`, `["projects"]`, `["tags"]`. Mutations invalidate by prefix.

## URL state on the notes list

- Everything that shapes `/notes` (tag, project, date as `yyyy-MM-dd`, `q`, status, sort, order, page, pageSize) is a search param validated by `notesSearchSchema` in `frontend/src/notes/notes-list/notesSearch.ts`. New list state goes into that schema, not `useState`, so back/forward and reload restore it.
- Zod v4 schemas are passed to `validateSearch` directly, each field ending in `.catch(undefined)`; `@tanstack/zod-adapter` is not used.
- Update params with `search: (prev) => ({ ...prev, ... })` so other filters survive.
- A search middleware on the route drops `page` whenever a filter changes.
- "Back to list" targets (the note page's All Notes link, the redirect after delete) use `lastNotesSearch()`. The sidebar entry stays unfiltered.
- Per-viewer display preferences (grid/table view mode) live in localStorage, not the URL.
