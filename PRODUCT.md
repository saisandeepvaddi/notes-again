# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Sai Sandeep Vaddi, the sole primary user — a personal, self-hosted tool built for his own daily use. The code is open source and others can self-host their own instance, but the product is not designed or prioritized for a third-party audience; decisions optimize for the builder's own workflow. Access is deliberately locked down: Firebase auth plus an optional `ALLOWED_EMAILS` allowlist, no open sign-up.

## Product Purpose

A personal knowledge-retention system: capture anything worth remembering as freeform markdown notes, organize them into projects and tags, and resurface them for review on a spaced-repetition schedule (FSRS/SM2) so the knowledge actually sticks instead of being written once and forgotten. General-purpose, not domain-specific — the user's current heaviest use case is technical/coding material (LeetCode, DSA, algorithms), but that is a usage pattern, not a product constraint. Nothing in the design or copy should assume coding/technical content specifically.

## Positioning

Spaced repetition applied to freeform markdown notes rather than Anki-style flashcards — content can be a full explanation with code blocks, not a forced question/answer card. Capture is frictionless via a browser extension (save a page or selection with a hotkey), and existing Anki-style decks can be brought in through JSON import.

## Operating Context

- Material is whatever the user wants to remember; it is not domain-specific. Currently, in practice, that's heavily technical/coding knowledge (DSA problems, algorithms), but the product makes no assumption about content type — projects, tags, and difficulty are all user-defined and free-form.
- Notes are organized into projects (decks) and tags; one tag axis doubles as a difficulty label (easy/medium/hard).
- Review happens as a dedicated session with SM2/FSRS-scheduled cards, rated Again/Hard/Good/Easy (recall confidence — distinct from a note's own difficulty tag).
- Capture happens outside the app via a browser extension (Chrome/Edge/Brave/Firefox) that saves a page or text selection using a scoped `capture`-only API token; notes are later organized inside the web app.
- Bulk import accepts an Anki-like JSON structure (decks, per-day limits, notes with tags/difficulty) with a dry-run/summary step before committing.
- Self-hosted via Docker; API served same-origin as the SPA in production, SQLite with Litestream backup to Cloudflare R2 optional.
- Deleted notes go to a trash with restore/empty-trash rather than deleting immediately.

## Capabilities and Constraints

- Single-tenant per deployment: auth is Firebase + allowlist, not multi-tenant account management.
- API tokens are scoped (e.g. `capture`-only tokens used by the extension can create notes/projects/tags but not read, edit, or delete).
- Local dev supports `AUTH_DISABLED=1` to bypass Firebase entirely.
- Two scheduling algorithms exist in the backend (SM2 and FSRS) — which is authoritative for new reviews is a codebase fact to confirm at implementation time, not asserted here.
- Markdown editor uses CodeMirror with its own theme; content supports code blocks.

## Brand Commitments

Name: "Notes Again" (package and infrastructure name `notes-again`; browser extension listed as "Notes Again Capture"). No other locked voice, logo, or identity constraints confirmed yet.

## Evidence on Hand

No testimonials, case studies, or usage metrics exist or should be fabricated — this is a single-user personal tool.

## Product Principles

- Capture must stay frictionless: saving something for later review should never be slower than the browser extension's one hotkey.
- Notes are real writing, not cards: freeform markdown, code blocks, and full explanations are first-class, not squeezed into a question/answer format.
- Review is the point: organization (projects/tags) exists to serve the spaced-repetition loop, not as an end in itself.
- Personal-tool constraints (single allowlisted user, self-hosted, SQLite) are deliberate simplicity, not gaps to "fix" toward a multi-tenant SaaS shape.
