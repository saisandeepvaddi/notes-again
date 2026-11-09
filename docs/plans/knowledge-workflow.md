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

- [ ] Offer Link only, Readable article and Selection modes; preserve the existing selection workflow.
- [ ] Extract the main article from the rendered browser page without requiring an LLM; sanitize and convert it to editable Markdown.
- [ ] Preserve headings, lists, links, tables and code; preview extraction and explain fallback to link-only.
- [ ] Store source URL, capture time and available author/publication metadata.
- [ ] Warn about duplicate source URLs without silently overwriting existing writing.
- [ ] Allow captures to start as Note only; do not automatically schedule long articles for review.
- [ ] Test representative articles, code-heavy pages, inaccessible/restricted pages and extraction failures.

Offline article text comes first. Durable offline images depend on Stage 4 attachments. Do not promise exact whole-site reproduction or bypass access restrictions.

### 3. Single-note bring-your-own-key chat

- [ ] Add an optional Discuss panel on web/desktop and an equivalent iOS screen.
- [ ] Configure a small set of providers, model selection and user-owned keys; keep secrets out of notes, logs and ordinary synced settings.
- [ ] Discuss the current saved note with streaming, cancellation, bounded context and clear errors.
- [ ] Offer explain, summarize and quiz-me actions; distinguish note-grounded answers from general knowledge.
- [ ] Show context and citations back to the note; treat note/clip text as untrusted reference material, not agent instructions.
- [ ] Save answers as notes only with confirmation; do not silently edit notes or change schedules.
- [ ] Disclose what is sent to the provider and show usage where available.

### 4. Attachments and per-note history

- [ ] Paste/upload images and attach PDFs, with explicit limits and safe handling.
- [ ] Keep attachments available offline, synchronized and included in backups/exports; handle orphan cleanup safely.
- [ ] Record bounded note revisions; browse, compare and restore earlier text without discarding the current version.
- [ ] Test attachment sync/deletion and revision restore across devices.

### 5. Connected notes and library chat

- [ ] Search and insert stable internal note links; preserve links across renames and devices.
- [ ] Show backlinks and make linked notes easy to navigate.
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
