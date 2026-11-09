# Plan: desktop, mobile and web as equals

Status: in progress. Follows the Rust backend (`480877c`). Phases 0–4 and 5a–5c are done for macOS and iOS; Android, Windows and Linux testing is deferred.

## Goal

1. Anyone can download and install the desktop app on macOS, Windows and Linux, and it keeps itself up to date.
2. Every way of running Notes Again can keep an off-site backup, with Litestream where a server runs.
3. A self-hosted server can run with or without the web UI, as a sync hub for every device.
4. Mobile, desktop and web offer the same features and work offline, with or without a server.

## Where things stand

Verified on 2026-11-06 against `main`:

| Area | Today | Gap |
|---|---|---|
| Desktop builds | `desktop.yml` builds macOS (Apple silicon), Windows and Linux on manual dispatch or a `desktop-v*` tag | Installers go to CI artifacts (need a GitHub login), nothing is signed, no Intel Mac build, no auto-update, Windows/Linux not yet built with the Rust backend |
| CI | Only the desktop build | No workflow runs the server tests, frontend checks or E2E |
| Litestream | Docker only (`docker-entrypoint.sh`); the server keeps WAL, never forces checkpoints, snapshots with `VACUUM INTO` | Not run end to end since the Rust port; `make run`, the direct install and the desktop app only get same-disk snapshots |
| Web UI | Served whenever `FRONTEND_DIST` has an `index.html` | No setting to turn it off; `doctor` calls a missing UI a mistake |
| Desktop reachability | In-process server on `127.0.0.1`, random port per launch, accepts API tokens | Phones can never reach it; the extension can't find it |
| Mobile | Online-only client of a server: review and undo, list, create, edit, difficulty, project, status, delete | No offline use; missing search, trash, tag edits on existing notes, organize, reschedule, interval previews, Markdown, settings, import/export, bulk |
| Sync | Desktop ↔ server, three-way merge, 20 integration tests | Only desktops sync; rows pulled from upstream keep their old `sync_version` (`sync_state.applying`), so a desktop can't relay them to a phone |

## Decisions

These are recommendations; the phases assume them.

- **Signing.** No OS code signing: it's open source, and forks can sign their own builds (documented in `desktop/README.md`). Release notes explain the Gatekeeper and SmartScreen prompts.
- **Updates.** `tauri-plugin-updater` with its own (free) signing key, reading `latest.json` from the newest GitHub Release. The checks run in Rust and surface in the tray, because the window loads the app from `127.0.0.1`, where Tauri's JavaScript APIs aren't available. AppImage, macOS and Windows update themselves; deb and rpm users update through the package.
- **macOS builds.** One universal binary (`universal-apple-darwin`) instead of separate Intel and Apple silicon downloads.
- **Mobile architecture.** Local-first, by embedding the Rust server in the app (`mobile/modules/notes-core`), exactly as the desktop does, rather than porting it to TypeScript: one implementation of the schema, scheduling and sync. The cost is an Expo development build instead of Expo Go (Expo Go falls back to the old remote flow).
- **Desktop as a hub.** With no server, the desktop is the phone's sync peer over the local network. With a server, both devices sync with the server and the desktop never acts as a hub.
- **Local network security.** The desktop's network listener only accepts `app` tokens, is off by default, is enabled through QR pairing, and serves HTTPS with a certificate the phone pins from the QR link.
- **Session-only features.** Token management and `/api/system` stay out of reach of `app` tokens by design. On mobile they appear read-only, with a pointer to the desktop or web app.

## Phase 0: CI as the safety net

Everything after this changes several apps at once, so CI comes first.

- `server.yml`: `cargo fmt --check`, `clippy -D warnings`, `cargo test` on Linux, macOS and Windows, which is also the first Windows/Linux build of the server.
- `apps.yml`: frontend `typecheck`, `lint`, `test`; extension `typecheck`, `test`; mobile `typecheck`, `lint`.
- `e2e.yml`: `make test-e2e` on Linux.
- `docker.yml`: build the image, start it with `BACKUP_REPLICA_URL=file:///replica`, write notes through the API, remove the container and volume, start a fresh one against the same replica, and check that the notes came back. This is the Litestream round trip that couldn't run locally.
- `desktop.yml` also runs on pull requests that touch `desktop/` or `server/`, building without uploading.

Done when every workflow is green on `main`. Needs: `gh auth refresh`.

## Phase 1: downloadable, self-updating desktop app

1. **Releases.** A `desktop-v*` tag builds every platform and attaches the installers to a draft GitHub Release (`tauri-action`). The version comes from the tag and is written into `tauri.conf.json` and `Cargo.toml`.
2. **Universal macOS build.**
3. **Auto-update.** Generate the updater key pair (private key in Actions secrets), add `tauri-plugin-updater`, publish `latest.json` with each release. The app checks on launch and daily, and offers the update in the tray with a notification. Includes "Check for updates…".
4. **Download path.** README and `docs/self-hosting.md` lead with "Download the desktop app" and link to the latest release; the web app's sidebar offers the desktop download when it's not running inside the desktop app.

Done when a fresh macOS, Windows and Linux machine can download, install and launch the app from the Release page, and installing an older release updates itself to the newest.

## Phase 2: optional web UI and backups everywhere

1. **`WEB_UI=off`.** The server skips the SPA, `/` returns a short page saying this is a Notes Again sync server, and `doctor` no longer reports the missing frontend. `install.sh` asks whether to serve the web app. Docker keeps one image; the setting decides.
2. **Litestream outside Docker.** `scripts/serve.sh` runs the server under `litestream replicate -exec` when `BACKUP_REPLICA_URL` is set, using the same `litestream.yml`. `install.sh` offers to install Litestream 0.5.17 for direct installs, and `doctor` reports whether replication is active.
3. **Desktop backups.** Settings → Data & backups gains a backup folder (default: inside the app's data folder; meant to point at iCloud Drive, Dropbox or a NAS share). Scheduled `VACUUM INTO` snapshots go there with the same retention as the server, and a Restore button swaps in a snapshot after restarting the in-process server. Desktops connected to a server already have a second copy there.
4. **Restore drill in the UI.** Settings lists every snapshot with a Download button, so a backup is checkable without a terminal. Restoring from the off-site replica stays a documented `litestream restore` command: running Litestream from inside the server would tie the server to it.

Done when the Phase 0 Docker round trip still passes, the same round trip passes for `make run` with a file replica, and a desktop restore from its backup folder brings back deleted notes.

## Phase 3: reach the desktop app from other devices

1. **Fixed port.** The desktop prefers port 47821 on `127.0.0.1` and falls back to a random port only if it's taken; Settings shows the address.
2. **Extension → desktop.** The extension's options page gains "Use the desktop app", which checks `http://127.0.0.1:47821/healthz`, and the desktop's Settings → API tokens creates a `capture` token for it in one click.
3. **Local network access.** Opt-in setting "Let my phone connect": the desktop opens a second listener on the local network that accepts only `app` tokens (the desktop cookie never works there). It shows a QR code with the existing `notesagain://connect` link, carrying the desktop's LAN address and a new `app` token. Turning it off revokes those tokens and closes the listener.
4. **Discovery.** The QR link carries the computer's `<hostname>.local` name as a fallback address (`alt` in the connect link), which macOS, Windows and Linux already answer over mDNS, so the phone reconnects after the IP changes without a custom mDNS service or a native module.

Done when the extension saves into a desktop-only setup, and a phone on the same Wi-Fi can pair by QR and use the existing online mobile app against the desktop.

## Phase 4: mobile feature parity

Online first, on the current client, so every screen exists before Phase 5 moves the data underneath.

| Feature | Web/desktop | Mobile before | Mobile now |
|---|---|---|---|
| Review, undo | ✓ | ✓ | ✓, with interval previews on the rating buttons |
| Notes list, filters, sort | ✓ | partial | partial: search, project and status filters; no sort or tag filter yet |
| Search | palette + list | list search | list search (same server matching); no project/tag hits yet |
| Create, edit, delete | ✓ | ✓ | ✓, plus tags on existing notes |
| Trash, restore, empty trash | ✓ | — | ✓ |
| Reschedule | ✓ | — | ✓ (native date picker on the note) |
| Organize projects and tags | ✓ | — | ✓ pause, resume, remove from/add to review, delete, new project, delete unused tags |
| Bulk actions | ✓ | — | ✓ multi-select: project, difficulty, pause, resume, review status, trash |
| Copy/share as Markdown | ✓ | — | ✓ share sheet |
| Settings: scheduling algorithm | ✓ | — | ✓ |
| Import, export | ✓ | — | ✓ export through the share sheet, import from a file with a preview |
| Tokens, system, backups | session only | — | explained in Settings, pointing to desktop/web |

- Shared logic moves into the pure modules mobile already imports from `frontend/src` (filters, pacing labels, review-status labels), keeping them free of `@/` and DOM imports.
- Mobile gets an E2E suite (Maestro) covering review, capture, search and trash, run in CI on an Android emulator. Not done yet: Maestro needs its own installer, and the local check used the iOS simulator through deep links instead.

Done when every row above is ✓ and the Maestro suite passes. Left: list sort and tag filter, project/tag search hits, and Maestro.

## Phase 5: local-first mobile

1. **5a, desktop as a hub** (done). Rows applied from upstream get a new local `sync_version` and tombstone, with the version recorded in `sync_echoes`; the desktop's push skips echoes. `server/tests/sync_relay.rs` covers server → desktop → phone and back.
2. **5b, the server on the phone** (in review). `mobile/modules/notes-core` links the server crate (C ABI for iOS, JNI for Android) and the app starts it on `127.0.0.1` at launch with a per-launch secret; the existing screens talk to it unchanged. Settings → Sync connects it to a server or a desktop (QR or password) through the desktop sync endpoints, with a conflict picker. Verified on the iOS simulator: opens offline with no Connect step, pulls a server's notes through its own background sync, and keeps showing them with the server stopped.
3. **5c** (macOS/iOS only for now). Syncs on foreground and background; the server starts natively at `didFinishLaunching`, so on a release simulator build it answers within about a second of process start (was 3 s, waiting on React Native). Release executable is about 13 MB per architecture, stripped, server included. Still open: a physical device, Android (deferred), Maestro.

## Phase 6: hardening

- Pinned TLS for the desktop's local-network listener (done): self-signed certificate per desktop, fingerprint in the QR link, pinned by the phone's Rust sync client. Covered by `tests/lan.rs` and `tests/sync_relay.rs` (wrong fingerprint and plain HTTP are refused).
- Performance budgets checked in CI: desktop cold start under 2 s, mobile list scroll at 60 fps with 10k notes, sync of 10k notes under 10 s.
- Accessibility pass on mobile (screen reader labels, dynamic type).

## Order and dependencies

Phase 0 first. Phases 1, 2 and 4 are independent and can run in parallel. Phase 3 needs nothing else, but its phone pairing is only useful with Phase 4's screens. Phase 5 needs Phases 3 and 4. Phase 6 last.
