# Notes Again desktop

A Tauri 2 shell around the regular app. It runs its own copy of the server, compiled into the app, on `127.0.0.1` with a database in the OS app-data folder, so it works with no server at all.

## How it starts

1. The window opens on `src/index.html`, a loading screen.
2. `src-tauri/src/backend.rs` starts the `server` crate (`notes_again_server::start_desktop`) on its own Tokio runtime with a random per-launch `DESKTOP_SECRET`. It binds a free port and returns it once it accepts requests.
3. The window navigates to `/api/auth/desktop?secret=…`, which sets an HttpOnly cookie and redirects to the SPA. Every API request needs that cookie (`AUTH_MODE=desktop`), so other programs on the machine can't read your notes through the port.
4. Links that leave `127.0.0.1` open in the system browser.
5. Quitting shuts the server down with the app, since it runs inside the same process.

## While it runs

- Closing the window keeps Notes Again in the tray (menu bar on macOS) so sync and reminders continue; quit from the tray menu or with Cmd+Q. Where no tray is available, closing quits.
- The tray menu opens the app, starts a new note, opens Review (with the due count), syncs now and checks for updates. On macOS the due count also shows next to the icon.
- A notification says when notes become due, at most once every three hours, and not while the window has focus.
- Cmd/Ctrl+Alt+Shift+N opens a new note from anywhere (`QUICK_CAPTURE` in `src-tauri/src/lib.rs`).
- Launching it again focuses the running window instead of starting a second copy, so one server owns the database.
- Window size and position are restored on the next launch.

## Sync

Settings → Sync connects to a self-hosted server with its username and password (traded for an app token named after this computer) or a pasted app token or connect link. The local backend then syncs in the background: within about 10 seconds of a local change, and every minute otherwise. Offline, everything keeps working and changes wait until the server is reachable. A note edited in both places gets a "Changed in two places" banner; Compare versions shows a side-by-side merge where you pick or combine the text. See `server/src/sync/` for the protocol.

## Backups

The app takes a snapshot of the database at launch and every 24 hours, keeping the last 7. Settings → Data & backups lists them, with Download for each. There you can also:

- **Choose the snapshot folder.** Point it at a folder in iCloud Drive, Dropbox or on a network drive to keep copies off this computer. The choice is stored for this device only (the `device_settings` table) and never syncs.
- **Restore a snapshot.** The server records the request next to the database and asks the app to restart its in-process server (`restart_backend` in `src-tauri/src/lib.rs`); the restore runs before the database opens again, the previous database is kept as `notes-again.db.before-restore-<time>`, and the window reloads.

If the app syncs with a server, the server holds another full copy.

## Where things live

| | macOS | Windows | Linux |
|---|---|---|---|
| Database and backups | `~/Library/Application Support/com.notesagain.desktop/` | `%APPDATA%\com.notesagain.desktop\` | `~/.local/share/com.notesagain.desktop/` |
| Backend log | `~/Library/Logs/com.notesagain.desktop/backend.log` | `%LOCALAPPDATA%\com.notesagain.desktop\logs\` | `~/.local/share/com.notesagain.desktop/logs/` |

## Develop

Needs Rust and pnpm.

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the SPA, then runs the shell against `frontend/dist/client` straight from the repo. Rebuild the SPA (`pnpm --dir ../frontend build`) to see frontend changes.

## Build

```sh
pnpm build
```

This builds the SPA, then `tauri build` compiles the app (the server is linked in) and bundles the SPA from `frontend/dist/client` as a resource. Installers land in `src-tauri/target/release/bundle/`; on Apple silicon the `.dmg` is about 9 MB.

Tauri doesn't cross-compile: build on each OS you target. `.github/workflows/desktop.yml` does that on GitHub's runners: a universal macOS build (Apple silicon and Intel), Windows and Linux. It builds on pull requests, uploads installers as artifacts when run by hand, and publishes a release on a `desktop-v*` tag.

## Releases and updates

Push a tag such as `desktop-v0.2.0`. The workflow sets that version in `tauri.conf.json` and `Cargo.toml`, builds every platform, and publishes a GitHub Release with the installers and `latest.json`.

The app checks `releases/latest/download/latest.json` 20 seconds after launch and then daily (`src-tauri/src/updates.rs`). A newer version shows up as "Restart to update to …" in the tray menu, with a notification; choosing it downloads, installs and relaunches. "Check for updates…" checks on demand. macOS, Windows and the AppImage update themselves; `.deb` and `.rpm` installs update through the new package.

Updates are signed with the Tauri updater key, which is separate from OS code signing and free. The public key is in `tauri.conf.json`; the private key is the `TAURI_SIGNING_PRIVATE_KEY` repository secret (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, empty here). Losing the private key means installed apps can't update anymore, so keep a copy. `tauri.release.conf.json` turns on the updater artifacts only for releases, so pull-request builds don't need the key.

Releases aren't code-signed. On macOS, open the app the first time with right-click → Open (macOS 15 and later: System Settings → Privacy & Security → Open Anyway); Windows SmartScreen asks to confirm with More info → Run anyway. Updates installed by the app don't ask again.

### Forks

To publish your own builds, generate a key with `pnpm tauri signer generate -w ~/.tauri/notes-again.key`, put the public key and your repository's `releases/latest/download/latest.json` URL in `plugins.updater` in `tauri.conf.json`, and add the private key as the `TAURI_SIGNING_PRIVATE_KEY` secret. To sign and notarize for macOS or sign for Windows, add Tauri's signing variables (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, or Windows' `certificateThumbprint`/`signCommand`) as secrets and pass them to the `tauri-action` step's `env`; see [Tauri's distribution guides](https://v2.tauri.app/distribute/).

## Icons

`app-icon.png` and `src-tauri/icons/tray.png` come from `node scripts/build-icons.mjs` at the repo root. Regenerate the platform icons with `pnpm icons`, then delete `src-tauri/icons/android` and `src-tauri/icons/ios`.
