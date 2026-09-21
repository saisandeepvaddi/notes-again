# Note and Learn Capture

Browser extension (Chrome/Edge/Brave and Firefox, Manifest V3) that saves the current page, or a text selection, as a note.

- **Save page**: toolbar button, `Alt+Shift+N`, or right-click the page. Name is the page title; content is the URL, a blank line, then the h1 and description/first paragraph when there is one.
- **Save selection**: right-click a selection, or `Alt+Shift+S`. Content is the URL, a blank line, then the selection.
- Both open a dialog where name, content, project and tags can be edited. Project and tags are created on the fly if they don't exist ("new" badge).
- On pages that can't host the dialog (`chrome://`, web stores, PDF viewers) the same form opens in a small popup window.

## Develop

```bash
pnpm install
pnpm dev            # Chrome, with reload
pnpm dev:firefox
pnpm test           # unit tests (vitest)
pnpm typecheck
pnpm build          # .output/chrome-mv3
pnpm build:firefox  # .output/firefox-mv3
```

`extension/` is its own pnpm root (`pnpm-workspace.yaml`). Keep it that way: without it pnpm adopts the nearest ancestor workspace and installs into it.

Load unpacked: Chrome `chrome://extensions` > Developer mode > Load unpacked > `.output/chrome-mv3`. Firefox `about:debugging` > This Firefox > Load Temporary Add-on > `.output/firefox-mv3/manifest.json`.

## Set up

Open the extension's options page:

1. **Server URL**: the API origin, e.g. `http://localhost:8000`. Saving asks the browser for access to that origin.
2. **App URL** (local dev only): where the web app is served if it isn't the API, e.g. `http://localhost:5273`. Used for "Open in Note and Learn".
3. **Firebase web API key + sign in**: same key as `VITE_FIREBASE_API_KEY` in the frontend. Leave empty if the server runs with `AUTH_DISABLED=1`. Only the refresh token is stored, never the password.

## How it talks to the backend

All requests come from the background script, so backend CORS needs no change and https pages can reach an http server.

`lib/api/index.ts` is the single swap point. Today it's implemented over the existing routes (`lib/api/existingRoutes.ts`): `POST /api/projects/create` and `/api/tags/create` (idempotent, case-insensitive), then `POST /api/notes/create`. Switching to a dedicated import endpoint means adding another `CaptureApi` implementation and returning it there.

Known gaps of the existing-routes approach: three round-trips per save, and no server-side dedupe by URL (the backend has no source-URL column).

## Known limitations

- A page listener on `document` in the **capture** phase still sees keystrokes typed into the dialog. Normal bubble-phase page shortcuts don't.
- Toolbar, shortcut and context-menu triggers need a real user gesture and are not covered by the automated tests.
- Firefox is built and passes `web-ext lint` (0 errors), but hasn't been exercised at runtime yet.
- Before publishing to AMO, review `data_collection_permissions` in `wxt.config.ts`.
