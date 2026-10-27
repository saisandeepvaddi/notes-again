# Plan: command palette and global search

Status: proposal. Branch: `command-palette`.

## Goal

One keyboard shortcut, from anywhere in the app (including while typing in a note), opens a palette that:

- finds notes by title and body text, with the match highlighted, as fast as you can type;
- finds projects and tags;
- runs app commands (go to Review, new note, toggle theme, trash this note, and so on);
- with an empty query, shows the notes you opened most recently, so it also works as a quick switcher.

Search is backed by a real full-text index, not a table scan.

## What exists today

- `GET /api/notes/list?search=` builds `name ILIKE '%q%' OR title_text(name) ILIKE '%q%' OR content ILIKE '%q%'` (`backend/notes/router.py`, `_list_conditions`). Every search reads every note's full text and runs a Python function (`title_text`) per row. It is fine at today's size (150 notes, 41 KB of text in the dev DB) and degrades linearly.
- `notes` carries B-tree indexes `ix_notes_name` and `ix_notes_content` (from `Field(index=True)`). Neither can serve a `%q%` match, and `ix_notes_content` stores a second copy of every note body.
- The frontend already ships `cmdk` and a shadcn `CommandDialog` (`frontend/src/components/ui/command.tsx`), used today by the tag and project pickers.
- Keyboard shortcuts in use:
  - `Cmd/Ctrl+B` toggles the sidebar;
  - `1`–`4` rate during review (`RatingButtons`, ignored while typing in a field);
  - **`Cmd/Ctrl+K` inserts a link in the note editor** (MDXEditor `linkDialogPlugin`).
- API tokens: `capture` scope is an allowlist (`tokens/service.py`), so a new route is closed to the extension by default and open to `app` tokens (mobile).

## Decisions to confirm

These are the choices that shape the rest. Each has a recommendation.

### 1. Shortcut

`Cmd+P` is print and `Cmd+K` already means "insert link" inside the editor, which is exactly where people will be when they want to jump. Options:

| Shortcut | For | Against |
|---|---|---|
| **`Cmd/Ctrl+/`** (recommended) | Free in the app and in browsers; you suggested it; easy to reach | Inside a code block, CodeMirror's toggle-comment loses `Cmd+/` (rare in notes). On some layouts (German, French) `/` needs Shift; matching on `event.key === "/"` still works there |
| `Cmd/Ctrl+K` | The most common palette key on the web (GitHub, Linear, Slack) | Fights the editor's link shortcut; either the palette or the link dialog has to lose inside the editor |
| `Cmd/Ctrl+Shift+P` | VS Code habit | Firefox opens a private window and the page cannot stop it |

Recommendation: `Cmd/Ctrl+/` everywhere, caught in the capture phase so the editor never sees it. Also `Cmd/Ctrl+K` when focus is **not** in the editor, as a convenience alias for people with that habit. Plus a visible **Search** button at the top of the sidebar (with the shortcut shown) and a search icon in the phone header, because shortcuts are invisible and phones have none.

### 2. How matching works

SQLite's FTS5 is built in (local 3.53, Docker's `python:3.14-slim` ships 3.46), so no new dependency. The choice is the tokenizer:

| | `trigram` (recommended) | `unicode61` (word-based) |
|---|---|---|
| "string" finds "Substring", "duplicate" finds `contains_duplicate` | Yes, same as today's search | Only with a prefix query, and only from the start of a word |
| Queries of 1–2 characters | Index can't help; fall back to a title-only `LIKE` (cheap) | Prefix query works |
| Index size | About 3× the text | About 1× the text |
| Ranking (`bm25`), `snippet()`, `highlight()` | Yes | Yes |
| Stemming ("running" finds "run") | No | Optional (porter), but it fights code identifiers |

Recommendation: **trigram**. It keeps today's "anything containing these letters" behaviour that people already rely on in the notes list, and notes here are heavy on code and identifiers. The size cost is small for a personal app: 10,000 notes of 4 KB each would be roughly 120 MB of index.

### 3. What gets searched

- **Recommended:** title and body of notes that aren't in the trash; projects and tags by name.
- **Not in v1:** trashed notes (the Trash page has its own list), review history, and filters like `tag:x` typed into the palette. These are noted as later work.

## Design

### Backend

**Index.** An FTS5 table that points at `notes` instead of copying it (external content):

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  name, content,
  content='notes', content_rowid='id',
  tokenize='trigram remove_diacritics 1'
);
```

The index is kept in sync by SQLite triggers, not by application code. Notes are written from several places: create, update, the bulk router, imports, restore from trash, hard delete, and `cli.py restore`. Triggers cover all of them, including future ones, without anyone having to remember the index:

- `AFTER INSERT ON notes`: insert the new row.
- `AFTER UPDATE OF name, content ON notes`: delete the old row from the index, insert the new one (the FTS5 external-content pattern).
- `AFTER DELETE ON notes`: delete the row.

Triggers index the raw `name` and `content`, not `title_text(name)`. The tokenizer already drops markdown punctuation like `**`, `#` and backticks. A trigger that called `title_text` would break any write made from a connection that hasn't registered that Python function, such as `sqlite3` on the server or `cli.py`.

Soft-deleted notes stay in the index and are filtered out with `deleted_at IS NULL` when querying, so trash and restore never touch the index.

**Setup and upgrades.** `ensure_search_index(engine)` in `db/setup.py`, called from `create_db_and_tables` after `ensure_indexes`:

- creates the table and the three triggers with `IF NOT EXISTS`;
- when it had to create the table, runs `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')` once, which indexes existing notes;
- an older snapshot restored with `cli.py restore` simply has no `notes_fts`, so the next start builds it.

`ensure_indexes` also gets `DROP INDEX IF EXISTS ix_notes_content`, and `content` loses `index=True` in the model. That index can't serve any query the app makes, and it doubles the space note bodies take.

`cli.py doctor` gains an index check (`INSERT INTO notes_fts(notes_fts, rank) VALUES('integrity-check', 1)`). A new `cli.py reindex` command runs `rebuild`, for recovery.

**Query building** (`backend/search/query.py`):

- Split the input on whitespace. Each term becomes a quoted FTS phrase (`"term"`, with `"` doubled), and terms are ANDed. Users never type FTS syntax by accident, so `NEAR`, `*`, `-`, `:` and stray quotes can't cause errors.
- Terms shorter than 3 characters can't use the trigram index. If every term is short, search titles only with `LIKE` (the table is tiny for titles); otherwise drop the short terms from the `MATCH` and apply them as `LIKE` filters on the matched rows.
- Ranking: `bm25(notes_fts, 8.0, 1.0)`, so a title hit outweighs a body hit. Ties break on `updated_at DESC`.
- Snippet: `snippet(notes_fts, 1, char(2), char(3), '…', 12)`. The control characters mark the match, and the client turns them into `<mark>` without ever rendering HTML from the server. The snippet is passed through a light markdown strip (links to their text, emphasis markers removed) that keeps the markers.

**Endpoint.** `GET /api/search?q=&limit=20` in a new `search` router package, mounted under `/api` like the others:

```json
{
  "notes": [
    {
      "id": 16,
      "title": "3. Longest Substring…",
      "title_highlight": "3. Longest \u0002Sub\u0003string…",
      "snippet": "…a set of values already \u0002see\u0003n…",
      "project": { "id": 1, "name": "NeetCode 150" },
      "status": "active",
      "updated_at": "…"
    }
  ],
  "projects": [{ "id": 1, "name": "NeetCode 150", "note_count": 150 }],
  "tags": [{ "id": 4, "name": "sliding-window", "note_count": 12 }]
}
```

Projects and tags match with `LIKE` on name; those tables hold dozens of rows, not thousands.

**Notes list.** `_list_conditions(search=…)` switches to the same matcher (`Note.id IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH :q)`, with the same short-term fallback). The palette and the `/notes?q=` filter then agree on what "matches" means, and the list gets the speed-up too.

### Frontend

**Where it lives.** `frontend/src/command-palette/`:

- `CommandPalette.tsx`: the dialog, mounted once in `Layout`;
- `useCommandPaletteShortcut.ts`: a window `keydown` listener in the capture phase for `Cmd/Ctrl+/` (and `Cmd/Ctrl+K` outside the editor);
- `useSearch.ts`: the query hook;
- `commands.ts`: the static command list;
- `recentNotes.ts`: the recently opened list.

Open state lives in a small context so the sidebar button, the phone header button and the shortcut all open the same instance.

**Search requests.**

- `useQuery({ queryKey: ["search", q], placeholderData: keepPreviousData })`, debounced by about 120 ms, with the request's `signal` passed through so typing cancels stale requests.
- The query only runs while the palette is open, with `staleTime: 0`, so results are fresh every time it opens. `["search"]` joins the documented cache families in `AGENTS.md`, and note mutations invalidate it with the rest.

**What the list shows.** cmdk runs with `shouldFilter={false}`, because the server already filtered and ranked; commands are filtered locally with the same simple match. Groups, in order:

1. **Notes:** the title with highlighting, then one line of snippet, then the project name and a status icon (paused / note only) on the right.
2. **Projects** and **Tags:** opening one goes to `/notes` filtered by it. This uses `search: (prev) => …`, per the URL-state rules.
3. **Commands:**
   - go to All Notes / Review / Import / Organize / Trash / Settings;
   - New note;
   - theme light / dark / system;
   - toggle sidebar;
   - note width and editor border;
   - on a note page only: Move this note to trash, and Copy link.

**Modes.**

- **Empty query:** the last 8 notes opened (ids in localStorage, titles from the cache or a small request), then the commands.
- **A leading `>`:** commands only (the VS Code and Obsidian convention), which the input hint shows.
- **Plain text:** notes first, then projects and tags, then matching commands.

**Keys.**

- `↑`/`↓` move; `Enter` opens.
- `Cmd/Ctrl+Enter` opens a note in a new tab.
- `Esc` closes.
- Hovering doesn't steal the selection from the keyboard (a cmdk default).
- When the palette closes, focus returns to where it was, including the editor caret.

**Results.** The search term is highlighted with a `<mark>` styled from tokens (`bg-primary/15`, foreground text), in both themes. The palette shows distinct states for loading (keeps the previous results, plus a thin progress hint), no results ("No notes match “q”" plus a "Search all notes" row that opens `/notes?q=`) and errors (the message and a retry).

**Layout.** On desktop the dialog is centred near the top of the screen, 640 px wide. On phones it is full-width at the top with the on-screen keyboard open. Note rows use the reading font for titles, matching cards and the note page.

**Accessibility.** cmdk provides combobox/listbox roles. The dialog title is visually hidden but read out, and a polite live region announces "N results".

**Review page.** `RatingButtons` already ignores keys while typing in a field, so the palette input can't trigger ratings. An E2E test will cover that.

## Phases

1. **Index and API.** `notes_fts` with triggers and the upgrade path, `/api/search`, `cli.py doctor`/`reindex`, dropping `ix_notes_content`, and pytest tests. Nothing visible yet.
2. **Palette, notes only.** Shortcut, dialog, search results with highlight and snippet, opening a note, focus return, the sidebar and phone buttons.
3. **Everything else.** Projects, tags, commands, the `>` mode, recent notes, context commands on the note page, and switching the notes list `q` to the index.
4. **Finish.** E2E coverage, the phone layout pass, `AGENTS.md` updates (cache family, shortcut), and a benchmark run.

Each phase is one commit or PR, and each works on its own.

## Testing

**Backend (pytest).**

- The index follows every kind of write: create, update title, update body, bulk delete, hard delete, import. Soft delete hides a note; restore brings it back.
- A database without `notes_fts` gets it built on start, with existing notes searchable.
- Hostile input returns results or nothing, never a 500. The cases: `"`, `*`, `NEAR(`, `-x`, `a:b`, emoji, accented text, 1–2 character terms, and very long input (capped at 200 characters).
- A title match ranks above a body-only match.
- `capture` tokens get 403 on `/api/search`; `app` tokens get 200.

**E2E (Playwright).**

- `Cmd+/` opens the palette from the notes list and from inside the editor. Typing shows the seeded note with the term highlighted, and `Enter` navigates there.
- `>` lists commands, and running "Go to Review" works.
- An empty query shows recent notes.
- `Esc` returns focus to the editor.
- Typing digits in the palette on the review page doesn't rate the card.

**Performance.** A script seeds 10,000 notes (about 4 KB each) into a throwaway DB and times `/api/search` for typical queries. Targets: p95 under 30 ms on the server, and no visible flicker in the palette while typing (old results stay until new ones arrive).

## Later

- Filters typed into the palette (`tag:`, `project:`, `is:paused`).
- Jumping to and highlighting the match inside the opened note.
- Searching trashed notes from the Trash page with the same index.
- Mobile app search using the same endpoint.
- A user-configurable shortcut.
