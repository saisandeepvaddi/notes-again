# Notes Again desktop

A Tauri 2 shell around the regular app. It runs its own copy of the backend on `127.0.0.1` with a database in the OS app-data folder, so it works with no server at all.

## How it starts

1. The window opens on `src/index.html`, a loading screen.
2. `src-tauri/src/lib.rs` starts `backend/desktop_server.py` with a random per-launch `DESKTOP_SECRET`. The server binds a free port and prints `NOTES_AGAIN_READY <port>` once it accepts requests.
3. The window navigates to `/api/auth/desktop?secret=…`, which sets an HttpOnly cookie and redirects to the SPA. Every API request needs that cookie (`AUTH_MODE=desktop`), so other programs on the machine can't read your notes through the port.
4. Links that leave `127.0.0.1` open in the system browser.
5. Quitting closes the server's stdin; the server exits when stdin closes, so it also stops if the app crashes.

## While it runs

- Closing the window keeps Notes Again in the tray (menu bar on macOS) so sync and reminders continue; quit from the tray menu or with Cmd+Q. Where no tray is available, closing quits.
- The tray menu opens the app, starts a new note, opens Review (with the due count) and syncs now. On macOS the due count also shows next to the icon.
- A notification says when notes become due, at most once every three hours, and not while the window has focus.
- Cmd/Ctrl+Alt+Shift+N opens a new note from anywhere (`QUICK_CAPTURE` in `src-tauri/src/lib.rs`).
- Launching it again focuses the running window instead of starting a second copy, so one backend owns the database.
- Window size and position are restored on the next launch.

## Sync

Settings → Sync connects to a self-hosted server with its username and password (traded for an app token named after this computer) or a pasted app token or connect link. The local backend then syncs in the background: within about 10 seconds of a local change, and every minute otherwise. Offline, everything keeps working and changes wait until the server is reachable. A note edited in both places gets a "Changed in two places" banner; Compare versions shows a side-by-side merge where you pick or combine the text. See `backend/sync/` for the protocol.

## Where things live

| | macOS | Windows | Linux |
|---|---|---|---|
| Database and backups | `~/Library/Application Support/com.notesagain.desktop/` | `%APPDATA%\com.notesagain.desktop\` | `~/.local/share/com.notesagain.desktop/` |
| Backend log | `~/Library/Logs/com.notesagain.desktop/backend.log` | `%LOCALAPPDATA%\com.notesagain.desktop\logs\` | `~/.local/share/com.notesagain.desktop/logs/` |

## Develop

Needs Rust, pnpm, uv and the backend venv (`make install-backend`).

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the SPA, then runs the shell against `backend/.venv` and `frontend/dist/client` straight from the repo. Rebuild the SPA (`pnpm --dir ../frontend build`) to see frontend changes.

## Build

```sh
pnpm build
```

This builds the SPA, then `scripts/bundle-backend.mjs` fills `build/` with a uv-managed standalone CPython (trimmed of tests, Tk and tooling), the backend's locked dependencies without `firebase-admin` and `fastapi-cli`, the backend source with precompiled bytecode, and the SPA. `tauri build` then bundles those as resources. Installers land in `src-tauri/target/release/bundle/`.

Neither Tauri nor the bundled Python cross-compiles: build on each OS you target. `.github/workflows/desktop.yml` does that on GitHub's macOS (Apple silicon), Windows and Linux runners when run by hand or on a `desktop-v*` tag, and uploads the installers as artifacts.

Unsigned builds run on the machine that built them. Elsewhere, macOS Gatekeeper blocks them until they're signed and notarized (Apple Developer account), and Windows SmartScreen warns until they're signed. Auto-update isn't set up: Tauri's updater needs a signing key and a place to publish releases.

## Icons

`app-icon.png` and `src-tauri/icons/tray.png` come from `node scripts/build-icons.mjs` at the repo root. Regenerate the platform icons with `pnpm icons`, then delete `src-tauri/icons/android` and `src-tauri/icons/ios`.
