# Notes Again Capture

Browser extension (Chrome/Edge/Brave and Firefox, Manifest V3) that saves the current page, or a text selection, as a note.

- **Save page**: toolbar button, `Alt+Shift+N`, or right-click the page. Choose **Link only** (the default) or **Readable article** (the main article as editable Markdown).
- **Save selection**: right-click a selection, or `Alt+Shift+S`. Content is the URL, a blank line, then the selection.
- All modes open a dialog where name, Markdown, project and tags can be edited. Switching modes preserves your content edits for each mode. Project and tags are created on the fly if they don't exist ("new" badge).
- Readable articles default to **Note only**, without a review schedule. An explicit review choice is kept, even when remembered preferences arrive later.
- On pages that can't host the dialog (`chrome://`, web stores, PDF viewers) the same form opens in a small popup window.

### Readable articles and source details

Mozilla Readability extracts from a copy of the current page's DOM. DOMPurify removes unsafe HTML, and Turndown converts the result into Markdown, preserving headings, lists, links, simple tables, quotes and code whitespace. Relative links become absolute. Extraction uses no LLM or remote extraction service, and it never changes the original page. You review and edit the Markdown before saving; extraction itself does not save anything.

Captures include JSON-quoted YAML frontmatter: `source_url`, `captured_at`, and, when extraction provides them, `source_author`, `source_published_at` and `source_site`. These are part of the note's editable content, not new server columns, so they travel with normal note sync, backups and Markdown exports.

Empty, failed, restricted or oversized pages explain why Readable article is unavailable; Link only and any available selection remain usable. Extraction is bounded to 30,000 elements and 2 million markup characters. It captures available page text, not an exact site reproduction, and does not bypass sign-in or paywalls. Images (up to 20 per note, 10 MB each) and inline SVG diagrams (rasterized to PNG) are downloaded and saved with the note as attachments; a checkbox turns that off. Videos and embeds become links. Many sites only allow the download when you grant "Allow image downloads" in the extension options; images that can't be downloaded stay as remote links or alt text.

### Duplicate warnings

The extension warns when a source URL appears in its last 500 successful captures for the same server and API token. Fragments and common tracking parameters are ignored, but meaningful query parameters are kept. History stores SHA-256 fingerprints and save times in browser-local extension storage, not raw source URLs or tokens. It is not synced and does not query the note library or broaden capture-token permissions.

This is a recent-capture reminder, not library-wide deduplication: it cannot detect saves from other browsers or earlier versions, and deleting a note does not remove its reminder. Changing the token, clearing extension storage or reinstalling forgets the history. Saving again always creates a separate note; it never overwrites existing writing. A history/preferences storage failure after a successful save does not turn that save into a reported failure.

## Develop

```bash
pnpm install
pnpm dev            # Chrome, with reload
pnpm dev:firefox
pnpm test           # unit tests (vitest)
pnpm test:browser   # build, then test the loaded extension in disposable Chromium
pnpm typecheck
pnpm build          # dist/chrome-mv3
pnpm build:firefox  # dist/firefox-mv3
```

`extension/` is its own pnpm root (`pnpm-workspace.yaml`). Keep it that way: without it pnpm adopts the nearest ancestor workspace and installs into it.

Load unpacked: Chrome `chrome://extensions` > Developer mode > Load unpacked > `dist/chrome-mv3`. Firefox `about:debugging` > This Firefox > Load Temporary Add-on > `dist/firefox-mv3/manifest.json`.

`pnpm test:browser` needs Playwright's Chromium (`pnpm exec playwright install chromium` once, if missing). It uses a temporary browser profile and an in-memory local API fixture, never an installed app's database. It verifies extraction, edited saves, Note only, recent duplicate warnings, link-only and selection capture, and the restricted-page popup; screenshots are written under ignored `test-results/`. Toolbar and context-menu user gestures themselves still need a manual smoke test.

After a rebuild, reload the extension so the browser picks up the new files: Chrome shows a refresh icon on the extension's card in `chrome://extensions`; Firefox's temporary add-ons show a "Reload" button in `about:debugging`. Neither auto-reloads on `pnpm build`; use `pnpm dev` / `pnpm dev:firefox` instead if you want that.

## Set up

1. In the web app open **Settings > API tokens > Create token**, and copy the token (it's shown once).
2. Open the extension's options page and fill in:
   - **Server URL**: the API origin, e.g. `http://localhost:8000`. Saving asks the browser for access to that origin.
   - **API token**: paste the token. Leave it empty only if the server runs with `AUTH_DISABLED=1` (local dev).
   - **App URL** (local dev only): see below.
3. **Test connection**, then save something.

With the desktop app instead of a server: in the app open **Settings > Phone & extension > Create a link for the extension**, then in the extension's options choose **Use the desktop app**. Paste the entire `notesagain://connect?…` link into **Desktop connection link** and click **Save**. This mode hides the manual server/token/App URL fields; the link supplies the app's actual address (including a fallback port) and capture token. **Test connection** checks the configured app. Saving pages only works while the desktop app is running. Valid connection links pasted into the old Server URL or API token fields also switch to the link form automatically.

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

Known gaps of the existing-routes approach: separate project/tag requests when creating them, and no server-side dedupe by URL (the backend has no source-URL column). Duplicate warnings use the bounded browser-local history described above.

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
