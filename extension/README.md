# Notes Again Capture

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
pnpm build          # dist/chrome-mv3
pnpm build:firefox  # dist/firefox-mv3
```

`extension/` is its own pnpm root (`pnpm-workspace.yaml`). Keep it that way: without it pnpm adopts the nearest ancestor workspace and installs into it.

Load unpacked: Chrome `chrome://extensions` > Developer mode > Load unpacked > `dist/chrome-mv3`. Firefox `about:debugging` > This Firefox > Load Temporary Add-on > `dist/firefox-mv3/manifest.json`.

After a rebuild, reload the extension so the browser picks up the new files: Chrome shows a refresh icon on the extension's card in `chrome://extensions`; Firefox's temporary add-ons show a "Reload" button in `about:debugging`. Neither auto-reloads on `pnpm build`; use `pnpm dev` / `pnpm dev:firefox` instead if you want that.

## Set up

1. In the web app open **Settings > API tokens > Create token**, and copy the token (it's shown once).
2. Open the extension's options page and fill in:
   - **Server URL**: the API origin, e.g. `http://localhost:8000`. Saving asks the browser for access to that origin.
   - **API token**: paste the token. Leave it empty only if the server runs with `AUTH_DISABLED=1` (local dev).
   - **App URL** (local dev only): see below.
3. **Test connection**, then save something.

With the desktop app instead of a server: in the app open **Settings > Phone & extension > Create a link for the extension**, then in the extension's options choose **Use the desktop app** and paste the link into **API token**; it fills in `http://127.0.0.1:47821` and the token. Saving only works while the desktop app is running.

The token can only save notes: list and create projects/tags and create notes. It can't read, edit or delete anything, and you can revoke it from Settings at any time (the extension will then say so).

## Where the links point ("Open in Notes Again")

Two addresses, because they are two different things:

| Setting | Meaning | Production | Local dev |
| --- | --- | --- | --- |
| Server URL | The API the extension saves to | `https://notes.example.com` | `http://localhost:8000` |
| App URL | The web app the "Open" link goes to | leave empty | `http://localhost:5173` (or `5273`) |

In production the API serves the web app from the same origin, so leaving App URL empty makes the link use the Server URL. In local dev the web app runs on Vite's own port, so set App URL. The options page suggests the usual dev ports when the server is on localhost and App URL is empty.

### Running your own deployment

Two ways, pick either:

- **At runtime:** each user opens the options page and enters their Server URL (and App URL if needed). Saving asks the browser for access to that origin.
- **At build time:** bake in your own defaults so users configure nothing. Create `extension/.env` (git-ignored) and build:

  ```bash
  WXT_SERVER_URL=https://notes.example.com   # required for a branded build
  WXT_APP_URL=                               # only if the web app lives elsewhere
  ```

  `pnpm build` / `pnpm build:firefox` then ships with those as the defaults, and Chrome grants access to `WXT_SERVER_URL` up front. Users can still change them in the options page.

## How it talks to the backend

All requests come from the background script, so backend CORS needs no change and https pages can reach an http server.

`lib/api/index.ts` is the single swap point. Today it's implemented over the existing routes (`lib/api/existingRoutes.ts`): `POST /api/projects/create` and `/api/tags/create` (idempotent, case-insensitive), then `POST /api/notes/create`. Switching to a dedicated import endpoint means adding another `CaptureApi` implementation and returning it there.

Known gaps of the existing-routes approach: three round-trips per save, and no server-side dedupe by URL (the backend has no source-URL column).

## Security model

- **The extension holds no long-lived secret of its own.** Access is decided by the server: every `/api` request needs a valid credential. The token you paste is a personal API token, scoped to saving notes, stored hashed on the server and revocable from Settings. Pointing the extension at someone else's deployment just gets a 401.
- **Never bake a token into a build.** `WXT_*` values end up in the published bundle; only put non-secret defaults (server and app URLs) there.
- **The token goes only to the server you configured**, and only after the browser has asked you to allow that origin. It's kept in the extension's own storage, which web pages can't read.
- **https is required** for any server that isn't this machine or a private network (localhost, 127.x, 10.x, 172.16-31.x, 192.168.x, `*.local`), because the token travels on every request.
- **Server side**: keep sign-in on (the default username and password, or Firebase). With Firebase (see `docs/firebase-auth.md`), keep "Enable create (sign-up)" off and consider `ALLOWED_EMAILS`, since any account in your Firebase project can read all notes.

## Known limitations

- A page listener on `document` in the **capture** phase still sees keystrokes typed into the dialog. Normal bubble-phase page shortcuts don't.
- Toolbar, shortcut and context-menu triggers need a real user gesture and are not covered by the automated tests.
- Firefox is built and passes `web-ext lint` (0 errors), but hasn't been exercised at runtime yet.
- Before publishing to AMO, review `data_collection_permissions` in `wxt.config.ts`.
