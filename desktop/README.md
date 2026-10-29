# Notes Again desktop

A Tauri 2 shell around the regular app. It runs its own copy of the backend on `127.0.0.1` with a database in the OS app-data folder, so it works with no server at all.

## How it starts

1. The window opens on `src/index.html`, a loading screen.
2. `src-tauri/src/lib.rs` starts `backend/desktop_server.py` with a random per-launch `DESKTOP_SECRET`. The server binds a free port and prints `NOTES_AGAIN_READY <port>` once it accepts requests.
3. The window navigates to `/api/auth/desktop?secret=…`, which sets an HttpOnly cookie and redirects to the SPA. Every API request needs that cookie (`AUTH_MODE=desktop`), so other programs on the machine can't read your notes through the port.
4. Links that leave `127.0.0.1` open in the system browser.
5. Quitting closes the server's stdin; the server exits when stdin closes, so it also stops if the app crashes.

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

Neither Tauri nor the bundled Python cross-compiles: build on each OS you target. Unsigned builds run on the machine that built them; macOS Gatekeeper blocks them elsewhere until they're signed and notarized.

## Icons

`app-icon.png` comes from `node scripts/build-icons.mjs` at the repo root. Regenerate the platform icons with `pnpm icons`, then delete `src-tauri/icons/android` and `src-tauri/icons/ios`.
