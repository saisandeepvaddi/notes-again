# Handoff: Notes Again

For an agent picking up work on this repo. Read this first, then [AGENTS.md](../AGENTS.md), which holds the conventions and is kept current. This file covers what AGENTS.md doesn't: the owner's standing rules, where the work stands, and what's left.

Last updated 2026-11-09: writing safety and readable-article clipping verified locally.

## What the app is

A personal, self-hosted spaced-repetition app. Freeform Markdown notes are organized into projects and tags and resurfaced for review on an FSRS or SM-2 schedule. One user per deployment.

There is one Rust server (`server/`, axum + sqlx on SQLite), and every client runs on it:

| Client | How it gets a server |
|---|---|
| Web (`frontend/`) | A static SPA served by a self-hosted server (`make run`, Docker, `install.sh`) |
| Desktop (`desktop/`, Tauri 2) | Links the server crate and runs it in-process on `127.0.0.1:47821` |
| Mobile (`mobile/`, Expo SDK 57) | Links the server crate through the local module `mobile/modules/notes-core` and runs it on the phone |
| Extension (`extension/`, WXT) | Capture only, through a `capture` token to a server or the desktop |

Devices sync through `/api/sync/push` and `/api/sync/pull` with a three-way merge. A desktop can relay between a server and a phone. A phone can pair with a desktop directly over Wi-Fi: the connection is HTTPS, and the phone pins the certificate fingerprint carried in the QR code.

## Rules from the owner (not written anywhere else in the repo)

Follow these exactly. They come from the owner's own instructions.

1. **No GitHub.** Don't open PRs, run Actions, call `gh` or push unless the owner asks. Every workflow in `.github/workflows/` is `workflow_dispatch` only, because Actions credits ran out.
   - Work on a branch, run the local checks listed in AGENTS.md, squash-merge into local `main`, delete the branch, and keep going without asking.
   - Pushing `main` is fine when the owner asks, since it triggers nothing.
2. **macOS and iOS only, for now.** Build and test only on this Mac and the iOS simulator. Android, Windows and Linux are deferred: don't install the Android NDK, `cargo-ndk` or cross toolchains.
3. **No code signing.** Desktop builds stay unsigned; forks can sign their own. Don't plan for Apple or Windows certificates. The Tauri updater key is separate: it lives at `~/.tauri/notes-again.key`, and the `TAURI_SIGNING_PRIVATE_KEY` secret is already set.
4. **No public release yet.** The repo is private until the owner is confident the app works end to end. Don't push `desktop-v*` tags and don't nudge about releasing. The updater reads public GitHub Releases, so it can't work while the repo is private.
5. **Named apps are shorthand.** "Like Obsidian" means a feel, not a spec. Design from [DESIGN.md](../DESIGN.md) and justify choices on their own merits.
6. **Don't work around the permission classifier.** It has blocked these before; if one is refused, stop and tell the owner:
   - downloading or running third-party binaries (for example Litestream)
   - writing GitHub secrets
   - force-pushing
   - pushing release tags

## Reference docs

| Doc | What's in it |
|---|---|
| [AGENTS.md](../AGENTS.md) | Layout, how to run things, how to verify changes, conventions (no code comments; format only the files you touch), auth modes, sync, query cache families |
| [frontend/AGENTS.md](../frontend/AGENTS.md) | TanStack guidance commands to run before editing TanStack code |
| [mobile/AGENTS.md](../mobile/AGENTS.md) | Expo layout, the on-device server, sharing code with the web app through `@web/*`, platform quirks |
| [desktop/README.md](../desktop/README.md) | Tauri app, phone access, backups, updater |
| [extension/README.md](../extension/README.md) | Browser extension |
| [PRODUCT.md](../PRODUCT.md) | Product intent and audience |
| [DESIGN.md](../DESIGN.md) | Visual system |
| [docs/self-hosting.md](self-hosting.md) | `make run`, `install.sh`, Docker, sign-in, Litestream, backups, `WEB_UI=off` |
| [docs/firebase-auth.md](firebase-auth.md) | Firebase auth setup |
| [docs/plans/cross-platform.md](plans/cross-platform.md) | **The active plan**, with phases and status |
| [docs/plans/command-palette.md](plans/command-palette.md), [docs/plans/self-hosting.md](plans/self-hosting.md) | Earlier plans (done) |
| [docs/ui-ux-polish-audit.md](ui-ux-polish-audit.md) | Earlier UI audit |

## Where things stand

The active plan is [docs/plans/cross-platform.md](plans/cross-platform.md): make desktop, mobile and web equals.

| Phase | Status |
|---|---|
| 0. CI workflows | Done, but manual-only now. Don't run them. |
| 1. Desktop releases, universal macOS build, auto-update | Done. Never released (rule 4). |
| 2. `WEB_UI=off`, Litestream outside Docker, desktop backup folder, snapshot list | Done |
| 3. Fixed desktop port, extension → desktop, phone access over Wi-Fi with QR pairing | Done |
| 4. Mobile feature parity | Done, except list sort, tag filter, project/tag search hits, and Maestro E2E |
| 5a. Desktop relays server changes to phones | Done |
| 5b. Rust server embedded in the mobile app (local-first phone) | Done, verified on the iOS simulator |
| 5c. Native early start, sync on foreground/background | Done for iOS |
| 6. Hardening | Pinned TLS done. Server performance budgets done (`server/tests/perf.rs`). Desktop cold start, mobile scrolling with 10k notes, and the mobile accessibility pass are open. |

Verified locally:
- All server tests pass (244+).
- Frontend, extension and mobile pass their typecheck, lint and tests.
- The desktop app builds.
- The iOS simulator app launches offline, syncs from a server, and keeps working with the server stopped.

Not verified yet:
- A physical iPhone, including pairing with the desktop over real Wi-Fi.
- Tapping through the mobile Sync screen: this Mac has no Simulator.app, so simulators run headless.
- Desktop cold start: launching a test build shares a data folder with the owner's installed app, so ask before running one.
- Maestro E2E: its installer was blocked.
- Android, Windows and Linux (deferred).

## What's next, in order

The owner approved [the knowledge-workflow checklist](plans/knowledge-workflow.md) on 2026-11-09: writing safety first, then readable-article clipping, single-note BYOK chat, attachments/history, connected notes/library chat, and everyday navigation/reading. Follow that checklist for new product work. The platform hardening items below remain open; mobile list sorting and tag filtering already exist in the current implementation.

Stages 1–3 are complete. Stage 3 (single-note BYOK Discuss: `server/src/discussion/`, `frontend/src/discussion/`, mobile `screens/discussion`, desktop `credentials.rs` for Keychain) is verified with mocked providers only; see the knowledge-workflow log for what is unverified. Writing safety is verified on web and iOS; `pnpm check:ios-export` and `pnpm check:ios-ui` cover the DOM-export workaround and native draft/sharing flows on disposable simulators. Readable-article clipping lives in `extension/lib/capture/article.ts`: Readability → DOMPurify → Turndown, with editable Markdown, portable source frontmatter, link/selection fallback and Note only defaults. Duplicate reminders cover the last 500 captures in this browser for the same server/token, not the whole library; no new token privileges or backend schema. Extension `pnpm test:browser` builds and exercises the actual extension in a disposable Chromium profile against an in-memory API fixture. Next: Stage 4 attachments and revisions. See the knowledge-workflow plan for checks and scope.

1. **Mobile accessibility pass** (Phase 6). Screen reader labels on icon-only buttons, rows and badges, and dynamic type support. You can check most of it with `pnpm typecheck` and `pnpm lint` and by reading the code; driving VoiceOver needs a device.
2. **Remaining Phase 4 parity:** list sort, tag filter, and project/tag hits in mobile search.
3. **Desktop cold start** against a 2 s budget. Ask the owner to quit the installed app first.
4. **Mobile list performance with 10k notes.** Best checked on a device.
5. When the owner allows: Maestro E2E, then Android, Windows and Linux.

Every change goes on its own branch and is squash-merged into local `main` (rule 1). Update the status in `docs/plans/cross-platform.md` and AGENTS.md as items land.

## Practical notes for this machine

- **CocoaPods** is at `~/.gem/ruby/4.0.0/bin`. Put it on `PATH` before `pod install`.
- **The iOS native build** needs the Rust library first: run `mobile/modules/notes-core/scripts/build-ios.sh`, then `npx expo prebuild` if `ios/` is missing, then `pod install` in `mobile/ios`. `ios/` and `android/` are generated and gitignored. The XCFramework has an `ios-arm64` slice and an `ios-arm64_x86_64-simulator` slice; release simulator builds need the x86_64 part.
- **Simulator.** The device is "iPhone 18 Pro" on iOS 27, running headless. Inspect it with `xcrun simctl`, the app container's SQLite database, and its `server.log`.
- **iOS 27** requires UIScene adoption. The config plugin `mobile/plugins/with-scene-lifecycle.js` handles it; keep it in `app.json`.
- **Metro** caches stale modules after package updates. Restart it with `--clear`.
- **Performance test:** `cargo test --release --test perf -- --ignored --nocapture` in `server/`.
- **Formatter pitfall.** oxfmt and `cargo fmt` reflow code, so a text replacement planned against the old layout can silently match nothing. Check that each edit actually applied.
- **`.playwright-mcp/`** has tracked files. When cleaning up screenshots, delete only untracked ignored files: `git ls-files --others --ignored --exclude-standard .playwright-mcp`.
- **`.DS_Store`** shows as modified. Leave it out of commits.
- **PR #7** on GitHub is stale. The owner may close it; don't touch it.
