# UI/UX polish audit: from utility to something you would pay for

Branch: `pro-polish-research`

## Method

Ran the real app against a throwaway database (`AUTH_DISABLED=1`, 18 notes across 4 projects, 8 tags, mixed due/paused/note-only/trashed states), then captured every route in light, dark, and 390px mobile, plus the interactive states that matter: table view, multi-select bar, review after a rating, destructive dialogs, the reschedule popover, empty search, and an unknown URL. 32 screenshots, `/tmp/na-audit/*.png`.

Read against [DESIGN.md](../DESIGN.md) and [AGENTS.md](../AGENTS.md) rather than against a generic taste checklist. This is a single-user personal tool, so "pro grade" here means **craft, consistency, and trust in the daily loop**, not marketing surfaces, onboarding funnels, or multi-tenant SaaS shape.

**Design read:** a dense working notebook for one power user, with a paper-and-ink identity, leaning toward keep and sharpen the existing tokens (Geist + Literata, warm neutrals, green ink, flat hairline surfaces). Dials for this pass: `DESIGN_VARIANCE 4`, `MOTION_INTENSITY 3`, `VISUAL_DENSITY 6`. Low variance and low motion are correct for a tool used dozens of times a day. The gains are in hierarchy, feedback, state coverage, and eliminating rough edges, not in a visual reinvention.

## Verdict

The system is already coherent: warm paper neutrals, one green accent, serif for content and sans for chrome, flat hairline containers. It reads as intentional, which is more than most "bland notes apps" manage. What holds it back is not the palette. It is:

1. Unfinished states (unknown route = infinite spinner, no route titles, bare text empty states).
2. Control clutter, especially on the notes list and on mobile.
3. A review screen that looks like a form next to a mostly empty page, despite review being the product.
4. Missing trust signals (no undo on single delete, destructive confirm painted green, no save/last-saved clarity).
5. Fixed-height cards that both waste space and cut real content off mid-table.

## P0: fix before anything cosmetic

| # | Issue | Where | Why it matters |
|---|---|---|---|
| 1 | Unknown URL renders an endless spinner and an empty shell | `routes/__root.tsx` `notFoundComponent` is never a usable page | A dead app on a stale bookmark reads as broken software |
| 2 | No `errorComponent`, so a render or query failure surfaces TanStack's raw error | `routes/__root.tsx`, routes | A single bad row should not dump a stack trace on the owner |
| 3 | Destructive flows are inconsistent: single-note Delete has no confirm and no undo, while "Empty trash" confirms with a **green primary button** | `NoteDetail.tsx:148`, `TrashList.tsx` | Destructive action colour must mean destructive; green primary on permanent delete trains the wrong reflex |
| 4 | Mobile note page clips code lines (`1e18)` truncated mid-line) | `styles.css` `.markdown-content`, `NoteContent` | Code is first-class content per PRODUCT.md; clipping it breaks the core promise |
| 5 | Every route ships the same document title ("Notes Again") and no description | route `head()` | Tab and history are unusable with several notes open; also blocks link previews |

## Cross-cutting

### Shell and navigation
- Sidebar is good: icon plus label, collapse, project list, theme control. What is missing is a **global way in**. There is no search entry point outside the notes list, no command palette, and no keyboard map. Add `Cmd/Ctrl+K` (jump to note, project, tag, or action) and `/` to focus search. This is the single strongest "pro" signal for a keyboard-driven user.
- The active project is not reflected in the sidebar when filtering `/notes?projectId=…`; only the top-level route highlights. Filter state and nav state should agree.
- Sidebar footer hides the theme control behind a generic "Theme" label with three unlabelled icons. Either move theme into Settings only, or make it a single labelled menu with "System / Light / Dark". Right now it exists in two places with two different control shapes.
- No account, session, or sign-out affordance anywhere in the shell. Even for one user, the owner needs a visible way out, and it is where people look for "version / backup status".
- Collapsed state and note list mode are persisted, but page-level filter state is not remembered across a full reload (only `lastNotesSearch()` in memory). Consider persisting the last list filter set.

### States
- Loading is inconsistent: skeletons exist (`PageSkeletons.tsx`) but first paint on mobile is a bare centred spinner on empty paper, and route transitions flash the spinner. Prefer layout-shaped skeletons everywhere, and keep the previous data visible while refetching.
- Empty states are uneven: "No notes yet" is composed and actionable, "No notes match this filter" is a single grey sentence with no "Clear filters" action, "No tokens yet" is a dashed box, and Trash has no empty treatment at all.
- No route-level error or offline treatment. If the backend is down, the shell renders and content silently blanks.

### Hierarchy and type
- Page titles are `text-lg` (18px) with body at 12px. The result is a very flat page: title, section heading, and body sit within 6px of each other (`PageHeader` vs `OrganizeList` vs `text-xs`). Raise page titles to 20-22px and reserve 12px for tables and controls only. Settings and Import body copy at 12px is below comfortable reading size.
- Section headings outside `PageHeader` are sans `text-base` (Organize, Settings groups) while note titles are serif. That is correct per the Reading Serif Rule, but sections need more separation: a hairline plus spacing, not just weight.
- Difficulty chips appear on every card and every table row. When everything is labelled, nothing is. Show difficulty only when it is the active filter, or in table view where scanning matters. Same argument for the due-state chip: "3 days overdue" repeating 17 times is noise; make overdue the visually distinct state and let on-time notes stay quiet.

### Motion and feedback
- Motion is currently almost absent: no transition when advancing review, no entry for new cards, no press feedback on rating buttons. At `MOTION_INTENSITY 3`, add only: (a) a 120-160ms crossfade plus 4px slide when the review card changes, (b) `scale-[0.98]` on press for pills and rating buttons, (c) a subtle count-up on the review progress bar. All must collapse under `prefers-reduced-motion`.
- Save feedback is a tiny grey "Saved" that appears next to a red Delete pill (`NoteDetail.tsx:144`). Replace with a single, stable header affordance: "Saved" / "Saving…" / "Unsaved changes" with a dot, or move to an autosave indicator near the title. Never place it adjacent to the destructive control.
- Toasts are used for rating results but not for single delete, pause/resume, project reassignment, or import completion in some paths. Audit every mutation for one of: optimistic UI, undo toast, or inline confirmation.

### Accessibility
- Placeholder-as-label on the sign-in screen (username, password) and on Import's deck field. Use visible labels.
- Icon-only controls rely on `aria-label` in some places (view toggle, theme) and on tooltips in others. Standardise: tooltip plus `aria-label`, and a visible label wherever space allows.
- Focus rings exist and are consistent, but keyboard order on the notes list runs through tag chips, then status group, then view toggle, then cards. That is a lot of tabbing before content on every visit; add skip-to-content and consider a single filter entry point (see below).
- The selection bar floats over pagination and the last rows (`x-selection.png`). Keyboard users cannot reach the covered rows.

### Dark mode
- Dark tokens are sound and the note page reads well. Weak spots: difficulty chips lose contrast at small size (amber on charcoal), the trash icon column in table view is nearly invisible, and the code block background is close enough to the card that the boundary disappears. Verify each against WCAG AA with the actual tokens.

## Page by page

### Notes list (`/notes`) - highest traffic
Working: URL-driven state, tag quick-filter, grid/table parity, bulk selection, infinite grid, real empty state.

Improve:
- **Toolbar overload.** Three stacked control rows (tags, search plus status, view toggle) plus header actions. Collapse to one row on desktop: search (with `/` hint and a clear button), a Filters popover containing review status and tags with active-count badge, then view toggle. Keep the 4-5 most-used tags as chips below only when a tag is active. On mobile this becomes: search, filter sheet, and a single "Review" primary action.
- **Ambiguous "All".** "All" appears in the tag bar and in the status group. Rename the status option to "Any status" and show a single clear "Clear filters".
- **Fixed `h-72` cards.** Short notes float in dead space; long notes clip a table mid-row (`light-notes.png`, "Cache invalidation strategies"). Use a content-driven height with a `line-clamp` on the body (6-8 lines) plus `grid-auto-rows` alignment so footers still line up per row, or a compact row variant for short notes. Do not clip tables in the middle of a row.
- **Tag overflow.** Card chips truncate to "bo…" and "psychol…". Show two chips plus "+2".
- **Due language.** "3 days overdue" and "1 day overdue" read like status errors. Use "Due 3 days ago" / "Due today" / "Next in 2 days" / "Paused", with overdue as the only tinted state.
- **Table view.** Preview column is ~140px and truncates everything; widen it or drop it in favour of a two-line excerpt. Always-visible trash icon per row is visual noise and a misclick risk; move row actions into an overflow menu. Sticky header on scroll.
- **No-results state.** Add an icon, "No notes match these filters", and a Clear filters button. Restore focus to search when the query changes the result set to zero.
- **Bulk bar placement.** Anchor it above pagination and keep it from covering rows; show "17 selected" plus a select-all-matching hint.

### Note detail (`/notes/$noteId`)
Working: fast autosave, serif title, markdown rendering with Shiki, per-note tags/project/difficulty, reminder list, reschedule popover.

Improve:
- **Header redesign.** One line: back, editable title, then a right-side group of "Saved" and an overflow menu. Delete moves inside the overflow menu as a red item with confirm and undo, not a permanent red pill beside the save state.
- **Metadata rail.** Everything is currently a wrap of pills (status, due, difficulty, project, tags, algorithm). Group into a compact metadata block under the title or a right rail on `xl`: status, next review, difficulty, project, tags, created/updated, review history (last 5 ratings), algorithm. Show "FSRS" with a label like "Algorithm: FSRS", not as a bare chip that looks like a tag.
- **Editor surface.** The content card is a full-width bordered box with a 700px minimum height, which makes a three-line note look like an empty form. Let it grow to content with a sensible minimum, and shade the editor surface only on focus or hover.
- **Missing reading affordances.** Word count and reading time, copy-link to the note, open in review, and prev/next within the current filter (`lastNotesSearch()` already gives you the context).
- **Delete flow.** Confirm plus undo toast, and return to the filtered list rather than a bare list.

### Review (`/review`) - the product's reason to exist
Working: keyboard 1-4, undo toast, sticky rating area, session-complete state, progress bar.

Improve:
- **Composition.** Today it is a narrow left column on a mostly empty page (`light-review.png`). Centre the session in a bounded column (`max-w-3xl mx-auto`) with the progress at the top, the note in a reading surface, and the rating block pinned to the bottom of the viewport. On desktop, use the empty right side for context: project, tags, difficulty, last reviewed, and a note-level "Open note" link.
- **Interval previews on the buttons.** Show the resulting next interval under each rating ("Again · 10m", "Good · 4d", "Easy · 12d"). This is the single most trust-building detail in a spaced-repetition tool, and it converts the buttons from anonymous to explainable.
- **Rate context.** Add "Undo last" as a persistent, reachable control, not only a transient toast. Show per-session tallies in the completion state (Again / Hard / Good / Easy counts, time spent) instead of only "Reviewed 10 notes".
- **Session controls.** Skip, end session, and edit-this-note are all missing. Even a personal tool needs "not now, come back later".
- **Mobile.** Move the rating bar to the bottom for thumb reach; it currently sits mid-screen with most of the viewport empty beneath it (`m2-review.png`). Hide the desktop-only hint (it already does via `pointer: coarse`), and enlarge the touch targets.
- **Hint copy.** "Rates your recall this time, not the note's Easy/Medium/Hard label" is doing real work but reads like a disclaimer. Consider a one-time inline explainer or a tooltip on the difficulty chip instead.

### New note (`/notes/new`)
Working: minimal, focused, defaults sensible.

Improve:
- **Editor parity.** The create screen uses a plain `<Textarea>` with the placeholder "Notes here", while the detail page has the CodeMirror markdown editor with syntax highlighting (`x-new.png`). The most important writing surface in the app should not be the worst one.
- **Structured form, not a stack.** A single wide Name field plus a full-width note box and then a loose row of pill controls. Align with the note detail layout: title line, editor, metadata row, primary action at the bottom right.
- **Fields have no labels** (placeholder-as-label) and the page title is `text-lg` in a 12px page. Add labels, and make the primary action unambiguous ("Create note", not "Create").
- **Keyboard-first creation.** `Cmd/Ctrl+Enter` to save, `Escape` to discard with confirm, autofocus the title, and "Create and add another" for capture sessions.

### Organize (`/organize`)
Working: half the job is done (counts, bulk pause/resume, delete with note handling).

Improve:
- **Row action overload.** Every row shows Pause, Note only and a trash icon in the same weight. Choose one primary per row (Pause or Resume based on state), move the rest into an overflow menu.
- **Built-in difficulty tags mixed into the list.** Easy/Medium/Hard sit alphabetically between `dp` and `graphs` (`light-organize.png`). Pin them in a separate "Difficulty" group above user tags, with a one-line explanation.
- **Counts should be links.** "6 notes" and "3 notes" are the most useful controls on the page; make them filter `/notes?projectId=…` / `?tagId=…`.
- **Rename and merge.** No rename, no merge for tags, no reorder for projects. These are table stakes for a tool you will run for years.
- **Header copy.** Two long explanatory paragraphs before any content. Move them into the section description or an info tooltip and let the lists lead.
- **Empty state.** If there are no projects or tags yet, the page has no guidance.

### Import (`/import`)
Working: dry-run preview, pacing controls, deck fallback, format disclosure.

Improve:
- **Native file input.** "Choose File No file chosen" is a raw browser control in an otherwise designed app (`light-import.png`). Replace with a styled drop zone: drag a JSON here or browse, filename plus size after selection, clear button.
- **Disabled Preview button.** It looks like a faded primary with no explanation. Either disable with an explicit reason ("Choose a file first") or keep it enabled and validate on click.
- **Format help.** The accordion is plain text. Add a small sample JSON that can be downloaded, and a link to the docs page.
- **Preview step.** Show a real summary card (decks, notes, tags, per-day spread, first due date) before committing, and a success state with "View imported notes" after.
- **Labels.** "Default new notes per day" and "Deck for notes without one" have no visible association to their inputs beyond proximity; label the inputs directly.

### Trash (`/trash`)
Working: restore, permanent delete, empty trash are all present.

Improve:
- **Empty state.** Nothing at all when the trash is empty. Compose it: icon, "Trash is empty", one line about what lands here.
- **Layout.** A single 273px card on an empty 1440px canvas, while "Empty Trash" floats far right in the page header. Use the same grid as the notes list, keep destructive actions inside each card or a footer, and make "Empty trash" a secondary danger action with a count.
- **Undo.** Permanent delete has a confirm; it should also be reversible for a few seconds where the API allows, or at minimum state that it is not.

### Settings (`/settings`)
Working: sectioned tabs with URL state, reading-font previews, real system data, API token management.

Improve:
- **Two theme controls.** The sidebar footer and Appearance both switch theme, with different control shapes and no shared label. Keep one (Appearance), or make both the same menu.
- **Tabs.** The vertical line-tab list renders a stray 3px vertical rule beside the active item (`x-s-tokens.png`), and on mobile the horizontal list scrolls with `System` half off-screen and no fade affordance. Fix the indicator, add scroll shadows, and make the mobile tab list scroll-snap.
- **Group headers.** Settings groups are `text-base` sans with a muted one-liner, then the control. That is fine, but the page needs a section container or rhythm: right now groups float in a very wide column with content stopping at ~600px and 600px of empty canvas to the right.
- **API tokens.** Empty state is a bare dashed box. Show a short explainer with the two token kinds side by side, a - **API tokens.** Empty state is a bare dashed box. Show a short explainer with the two token kinds side by side, a visible "copy" affordance for a newly created token (with a one-time warning), and `last_used_at` in the row. The data already exists in `types.ts`.
- **System.** This is developer console output (raw paths, `SQLite 3.53.1`, "Off-site backup: Not set up"). Keep the data, present it as friendly rows with labels and units, tuck it behind an "Advanced" disclosure, and give "Download database" / "Snapshot now" a result state ("Snapshot written to …") instead of silent completion.
- **Review defaults.** No preview of the scheduling effect. A single example line ("A note rated Good returns in about 4 days") would make the setting legible.
- **Danger zone.** There is none. For a self-hosted tool, "Reset login", "Delete all notes", or "Vacuum database" belong somewhere explicit rather than in the CLI only.

### Auth screens (login / setup)
Working: clear copy, real error messages, first-launch path.

Improve:
- **Placeholder-as-label.** Both inputs use placeholders as labels (`LoginScreen.tsx`). Add visible labels.
- **Show password** toggle, and a loading state that keeps the button width stable.
- **Brand presence.** The card is a bare shadcn card with the product name as the title. A small mark, a one-line positioning statement ("Notes you actually remember"), and the same paper-and-ink treatment as the app would make first contact feel deliberate.
- **Error placement.** The error sits between the password and the button; reserve space so the form does not jump, and connect it with `aria-describedby`.

### Mobile web (390px)
Working: sidebar becomes a sheet, cards stack, rating shortcuts hide on coarse pointers.

Improve:
- **Double header.** The shell renders "Notes Again" plus a menu trigger, then every page renders its own title (`m2-settings.png`, `m2-review.png`). Make the mobile header show the current page title (or hide it entirely) and keep one title per screen.
- **Action wrapping.** On the notes list, Review, Export, New Note, the tag bar, search, status and view rows consume roughly a third of the viewport before the first card (`m2-home.png`). Use a single filter sheet and one primary action.
- **Card height.** `h-72` cards leave large empty areas under short notes on a narrow column. Let height follow content on mobile.
- **Duplicate titles and cramped tables.** Table view is desktop-only, good. Make sure anything that is desktop-only is hidden on mobile instead of squeezed.
- **Touch targets.** Density is a deliberate desktop choice; confirm the `pointer: coarse` layer covers every interactive element including table row actions and tag chips (some chips are ~20px tall).

### Native mobile app (`mobile/`)
Out of scope for this pass, but two parity notes from reading `mobile/src/screens`: the Today screen and review screen now share typography with the web, so any change to review composition, rating labels, or interval previews should be made in both, and the review rating bar there is already bottom-anchored, which is the pattern the web review page should borrow.

## Features that would make it feel premium (fits the product principles)

Ranked by value per unit of work. Every one of these serves capture or review, not engagement metrics.

1. **Command palette (`Cmd/Ctrl+K`).** Jump to a note, filter by project/tag, run "New note", "Start review", "Toggle theme". Include a `?` shortcut sheet.
2. **Interval previews and a real session summary in Review.** Explained above; this is what makes the scheduler feel trustworthy.
3. **Note detail rail with review history.** Last five ratings, current interval, stability/difficulty for FSRS, created/updated. It turns a note from a text blob into a tracked object.
4. **Inline `[[wiki links]]` between notes with a backlinks section.** Pure markdown, no new concepts, and it makes a long-lived notebook compound in value.
5. **Quick capture in-app.** A global shortcut (`C`) opening a small capture composer, mirroring the extension, so capture does not require leaving the current page.
6. **Saved filters / smart views.** "Due today in Algorithms", "Hard notes I keep failing", surfaced in the sidebar. The URL schema already supports the pieces.
7. **Keyboard-first everything.** `n` new, `/` search, `g n` notes, `g r` review, `j/k` to move through the list, `space` to select, `enter` to open.
8. **Per-note print / export / copy as markdown.** Low effort, high perceived completeness, and useful for sharing knowledge outside the app.
9. **Optional daily goal and streak on the notes list header.** One quiet line ("12 reviews today, 4 left"), no gamification confetti. Aligns with "review is the point".
10. **Better import:** drag and drop, JSON schema download, richer preview, and an import history entry.

## Suggested sequence

**Phase 1: trust and states (about 1 day).**
404 and error boundaries, per-route titles, destructive-action consistency (confirm plus undo, red confirm), single-note delete undo, mobile code overflow, empty states for no-results, trash, and tokens, toast coverage for every mutation.

**Phase 2: the two core surfaces (2-3 days).**
Note detail header and metadata rail; Notes list toolbar consolidation, card height and tag overflow, due-label wording; review composition, interval previews, session summary, mobile rating placement.

**Phase 3: keyboard and speed (1-2 days).**
Command palette, `/` search focus, global shortcuts, skip link, filter state persistence, selection bar placement.

**Phase 4: perceived quality (1-2 days).**
Mobile header/title fix, Settings restructure (single theme control, grouped cards, API/system polish), Import drop zone and preview summary, auth screen redesign, typography scale pass (page titles 20-22px, 13px body outside tables), a small motion pass (review advance, press feedback), and a dark-mode contrast audit.

Keep the order: Phases 1 and 2 change how the product feels to use every day; Phase 4 is what makes it look paid for.

## Guardrails while implementing

- Stay inside [DESIGN.md](../DESIGN.md): one green accent, warm paper neutrals, hairline rings at rest, shadow only for floating overlays, Literata for content and Geist for chrome, pill badges as the only circular shape.
- Do not add a marketing hero, decorative illustration, or gradient visual language. The restraint is the identity.
- Respect the list-state conventions in [AGENTS.md](../AGENTS.md): new list state belongs in `notesSearchSchema`, never `useState`.
- No comments in code, per the repo convention.
- Verify with `pnpm typecheck`, `pnpm lint` in `frontend/`, and `make test-e2e`; add a Playwright case for any state you newly design (404, empty trash, no-results, review summary) since those are exactly the states that regress.

## Evidence index

Screenshots from this audit (`/tmp/na-audit/`): `light-notes.png`, `light-note.png`, `light-review.png`, `light-organize.png`, `light-import.png`, `light-trash.png`, `light-settings.png`, `light-new.png`, `dark-notes.png`, `x-table.png`, `x-selection.png`, `x-review-mid.png`, `x-review-after-rate.png`, `x-s-tokens.png`, `x-s-system.png`, `x-reschedule.png`, `x-trash-dialog.png`, `x-no-results.png`, `x-404b.png`, `m2-home.png`, `m2-review.png`, `m2-settings.png`, `m2-note.png`.

The seeded database and repro script live in `/tmp/na-audit/` (`seed.py`) and can be regenerated against any throwaway `DB_PATH` for before/after comparisons.
