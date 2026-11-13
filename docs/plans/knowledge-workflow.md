# Plan: capture, understand and remember

Status: in progress. Approved by the owner on 2026-11-09. This is the product-development checklist; [cross-platform.md](cross-platform.md) continues to track platform parity and hardening.

## Direction

Capture useful material, connect it to your thinking, discuss it, and remember it. Keep Notes Again a personal, local-first Markdown notebook with spaced repetition, not a smaller Notion or an Obsidian copy. Preserve DESIGN.md and the single-user architecture.

## Ordered checklist

### 1. Protect writing and explain failures

- [x] Web: recover new-note drafts, including title, body, project, tags, difficulty and review status, after navigation and reload.
- [x] Web: offer explicit draft discard and clear the draft only after successful creation or confirmed discard.
- [x] Web: explain failed creation inline and allow retry without losing input.
- [x] Web: warn before leaving if browser storage cannot preserve the draft.
- [x] iOS implementation: persist unfinished new notes and protect modal dismissal, not just the Cancel button.
- [x] iOS implementation: flush pending edits before Markdown sharing and prevent silent loss on save failure.
- [x] Web: add regression coverage for recovery, discard, successful creation, failed creation/retry, unavailable storage and navigation during creation.
- [x] Add pure save-queue regression coverage for debounce, concurrent flushes, edits during a request, failures and retry. Draft serialization uses the shared web module and its tests.
- [x] iOS: verify device draft storage, modal dismissal and sharing pending edits in native UI; add native UI regression coverage. `pnpm check:ios-ui` builds an unsigned release app, tests on a fresh disposable simulator and verifies the copied Markdown contains the latest edits.
- [x] Resolve the existing Expo DOM export failure (`Asset not found: _expo/static/js/web/__common-*.js`) before production native verification. `mobile/metro.config.js` disables bundle splitting to avoid Expo CLI 57.0.33's mismatched hashed artifact names and dependency references. `pnpm check:ios-export` verifies that both DOM pages load existing exported resources; no installed packages were patched.

### 2. Readable-article clipping

- [x] Offer Link only, Readable article and Selection modes; preserve the existing selection workflow.
- [x] Extract the main article from the rendered browser page without requiring an LLM; sanitize and convert it to editable Markdown.
- [x] Preserve headings, lists, links, tables and code; preview extraction and explain fallback to link-only.
- [x] Store source URL, capture time and available author/publication metadata. JSON-quoted YAML frontmatter stays in ordinary note content for sync/export portability.
- [x] Warn about duplicate source URLs without silently overwriting existing writing. Deliberately scoped to the last 500 successful captures from this browser for the same server/token; no library reads or capture-token expansion. Not library-wide deduplication; deleted notes may still produce a reminder.
- [x] Allow captures to start as Note only; do not automatically schedule long articles for review.
- [x] Test representative articles, code-heavy pages, inaccessible/restricted pages and extraction failures.

Offline article text comes first. Durable offline images depend on Stage 4 attachments. Do not promise exact whole-site reproduction or bypass access restrictions.

### 3. Single-note bring-your-own-key chat

- [ ] Add an optional Discuss panel on web/desktop and an equivalent iOS screen.
- [ ] Configure a small set of providers, model selection and user-owned keys; keep secrets out of notes, logs and ordinary synced settings.
- [x] Discuss the current saved note with streaming, cancellation, bounded context and clear errors.
- [x] Offer explain, summarize and quiz-me actions; distinguish note-grounded answers from general knowledge.
- [x] Show context and citations back to the note; treat note/clip text as untrusted reference material, not agent instructions.
- [x] Save answers as notes only with confirmation; do not silently edit notes or change schedules.
- [x] Disclose what is sent to the provider and show usage where available.

### 4. Attachments and per-note history

- [ ] Paste/upload images and attach PDFs, with explicit limits and safe handling.
- [ ] Keep attachments available offline, synchronized and included in backups/exports; handle orphan cleanup safely.
- [ ] Record bounded note revisions; browse, compare and restore earlier text without discarding the current version.
- [ ] Test attachment sync/deletion and revision restore across devices.

### 5. Connected notes and library chat

- [x] Search and insert stable internal note links; preserve links across renames and devices. (Web, server and mobile.)
- [x] Show backlinks and make linked notes easy to navigate. (Web, server and mobile.)
- [ ] Extend chat scope to selected notes, a project/tag and the library.
- [ ] Retrieve relevant passages instead of sending the entire library; show which passages were actually used and validate citations.
- [ ] Keep retrieval indexes current after edits, trash and deletion; exclude trashed notes by default.

### 6. Everyday navigation and reading

- [ ] Favorites/pinned notes and projects.
- [ ] Saved searches/collections built on existing filters.
- [ ] Simple reusable templates and note duplication.
- [ ] Reading mode, heading outline and long-note navigation.
- [ ] Evaluate passage highlights/annotations, iOS share-in and Markdown-folder/ZIP import/export.
- [ ] Consider a two-note split view only after the core workflow is solid.

## Guardrails and verification

- Work on a branch for each coherent change; run local checks, squash-merge into local main and delete the branch. No push, GitHub calls, releases or Actions without the owner's request.
- macOS and iOS only. Ask before launching a desktop test build that could share the owner's data folder.
- Use throwaway databases for runtime tests. Keep tests for pure logic in unit suites and user journeys in E2E.
- Preserve the open cross-platform checklist: accessibility, native device pairing, native UI tests and performance still need verification.
- Deferred: Notion-style databases/formulas, collaboration/permissions, plugin marketplace, canvas/global graph, autonomous AI mutation and public publishing.

## Progress log

- 2026-11-09: Stage 1 web writing safety completed: one recoverable browser-local draft, including note settings; confirmed discard; inline creation errors; unavailable-storage navigation protection; pending-creation edit protection. Typecheck, lint and 44 unit tests passed. The full E2E run passed 51/52 tests, with an unrelated API-token test timing out; the six writing-safety tests and three token/settings tests then passed twice each (18/18). Desktop and phone-sized web renders were inspected. iOS writing safety remains next.
- The audit found mobile sorting and tag filtering already implemented, despite the older handoff listing them as missing.
- 2026-11-09: iOS writing-safety implementation added. Drafts use a temporary file and replacement in the app's persistent documents directory, with explicit discard and storage-failure dismissal guards. Note saves are serialized; sharing, deletion and navigation await pending edits, and failed navigation saves require explicit confirmation to leave. Mobile typecheck/lint and frontend typecheck/lint/51 unit tests passed. Native export is blocked by the pre-existing Expo DOM asset failure reproduced on main; native UI behavior remains unverified.
- 2026-11-09: Stage 1 native verification completed. The DOM export regression check passed after disabling bundle splitting. An unsigned release build passed XCTest on iOS 27.2: draft recovery after Close, swipe dismissal and process relaunch; confirmed discard; note creation; and sharing the latest edits. Both native tests passed in a repeated run, then the reusable `pnpm check:ios-ui` command passed on a fresh disposable simulator, including a simulator-clipboard Markdown assertion. Generated simulators were deleted; existing app data was untouched. Next: Stage 2 readable-article clipping.
- 2026-11-09: Stage 2 completed in the extension. Link only, Readable article and Selection share an editable Markdown preview; switching modes keeps content edits. Readability extracts from a bounded page clone, DOMPurify sanitizes, and Turndown preserves text structure, simple tables and code whitespace. Source metadata is portable frontmatter; images/media are excluded. Articles default to Note only without overriding explicit choices. Duplicate reminders use 500 browser-local, server/token-scoped hashed source identities, not note-library access. Typecheck, touched-file lint, 70 unit/component tests and the Chromium production build passed. Three loaded-extension browser scenarios passed twice (6/6), using disposable profiles and an in-memory API fixture; desktop, narrow/dark and restricted-popup screenshots were inspected. Toolbar/context-menu gestures still need a manual smoke test. Next: Stage 3 single-note BYOK chat.
- 2026-11-09: Fixed extension desktop-pairing UX after an owner-reported paste failure. "Use the desktop app" now shows a masked Desktop connection link field instead of manual server/token/App URL inputs. Misplaced connection links switch to the right form, with actionable errors for incomplete or unsafe links; existing desktop settings migrate and manual self-hosted settings remain supported. Typecheck, touched-file lint, 77 unit/component tests and five loaded-extension Chromium scenarios passed, including saved connection restoration, actual connection testing and narrow/dark options rendering. Only the extension needs reloading; no desktop rebuild for this fix.
- 2026-11-10: Stage 3 single-note BYOK Discuss completed on web, desktop and iOS. Rust tests use a local mock upstream (payloads, auth headers, fixed error messages, redirects, SSE parsing, limits, slot release) plus route tests for validation, missing/trashed notes, auth and capture-token denial. Frontend unit tests cover SSE chunking/UTF-8, history bounds, credential vault failures, answer export and HTML/link/image safety, and six mocked-SSE Playwright flows cover setup, suggestion, streaming, errors, explicit retry, stop, save confirmation and unchanged source. Mobile typecheck, lint, export check and the disposable-simulator UI test (disclosure, no send without a key) passed on a rebuilt XCFramework. Not verified: a live provider, the macOS Keychain commands at runtime, iOS Keychain storage and a streamed answer on iOS; iOS shows answers as selectable plain Markdown. Next: Stage 4.
- 2026-11-10: Stage 4 revisions (server, web, desktop) added: trigger-recorded bounded history, list/compare/restore API and a History sheet with a line diff; restore keeps the current text. Server and frontend tests plus Playwright pass. Mobile History screen and attachments remain; revisions stay per device by design.
- 2026-11-10: Stage 4 attachments phase 1 (server, web, desktop): design in `attachments-design.md`; upload/serve API with magic-byte checks, limits, dedupe and cleanup triggers; Attach button and image paste/drop in the editor, authenticated rendering of images and PDF downloads. Server, unit and Playwright tests pass. Remaining: orphan cleanup job, export ZIP, sync of metadata and blobs, mobile.
- 2026-11-10: Stage 4 attachments phase 3 (sync): immutable `attachment` sync kind and verified blob endpoints/transfers; cross-device tests cover upload, second device, deletion of an attachment and of its note, late bytes and tampered/unreferenced uploads. Desktop-to-phone relay uses the same endpoints but was not run on a device. Remaining: orphan cleanup, export ZIP, mobile UI.
- 2026-11-11: Stage 4 attachments phase 2: hourly orphan cleanup (30-day grace, revisions count as references), per-note ZIP export with relative links (validated with `unzip -t`), backup/restore carries attachments; server tests and a Playwright download test pass. Remaining for Stage 4: mobile History and attachments UI, a manual multi-device check, and ticking the checklist items.
- 2026-11-11: Stage 4 mobile History: History screen from the note page lists this device's revisions, compares with the current note (shared `lineDiff`) and restores with confirmation, remounting the editor. Typecheck, lint and iOS export check pass; not yet run on a simulator. Remaining: mobile attachments.
- 2026-11-11: Stage 4 mobile attachments: Attach a file (photo library or PDF/image file) on the note page, images render in the reader and editor, PDFs open via the share sheet; bytes come from the on-device server, so they work offline after sync. Typecheck, lint, expo-doctor and the iOS export check pass; needs a native rebuild (new picker modules) and a device check, including a phone-to-desktop sync of a file. Image paste on mobile is not supported. Stage 4 checklist stays open until that device check.
- 2026-11-11: Stage 5 connected notes (server, web): links are `[Title](note:<uid>)`, so they survive renames and sync as plain text. `GET /api/notes/{id}/backlinks` (FTS match verified against the real link) and `GET /api/notes/link-targets` (resolve uids, flag trashed); notes and search hits now expose `uid`. Web: Link note dialog, backlinks section, clickable links in the reader and an Open linked note action in the editor popover; trashed or missing targets render struck through. Server, unit and Playwright tests pass. Remaining: mobile links/backlinks, then library chat scope and retrieval.
- 2026-11-12: Stage 5 mobile links: a Link a note screen (search, then append `[Title](note:<uid>)`), `note:` links in the reader and editor open the target note through `/api/notes/link-targets` (trashed or unsynced targets show an alert), and a Linked from list on the note page. Typecheck, lint and the iOS export check pass; not run on a simulator. Remaining in Stage 5: library chat scope and retrieval.
