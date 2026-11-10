# Attachments design (Stage 4)

Images and PDFs attached to a note. Decisions, in build order. Update this file as phases land.

## Model

- `attachment_blobs(hash PK, mime, size, data BLOB)`: content-addressed (SHA-256), so identical files are stored once. Blobs live in SQLite so `VACUUM INTO` backups, restores and transactions cover them with no second store to keep consistent.
- `attachments(id, uid, sync_version, note_uid, name, mime, size, hash, created_at)`: one row per attachment on a note. `uid` and `sync_version` follow the other synced tables (triggers in `ensure.sql`, tombstones on delete).
- Notes reference attachments in Markdown as `![alt](attachment:<uid>)` (images) or `[name](attachment:<uid>)` (PDFs). The scheme is portable text, survives revisions and sync, and each client resolves it to a file URL.

## Limits and safety

- Allowed: PNG, JPEG, WebP, GIF (10 MB) and PDF (25 MB); 20 attachments per note. SVG and everything else rejected. Type is decided by magic bytes, never the client's MIME or file name.
- Served from `/api/attachments/{uid}/file` behind normal auth with the sniffed type, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` and `Content-Disposition` (PDFs `inline` only for the sniffed type, names sanitized). Renderers show images and link PDFs; no remote fetches.
- Upload is a raw-body POST with the file name in a header, so no multipart dependency and the body limit can be checked before buffering. Capture tokens cannot upload.

## Lifecycle

- Deleting a note permanently removes its attachment rows; a blob is deleted when no row references it (trigger).
- Orphans: an attachment whose uid is no longer referenced by the note text or any of its revisions for 30 days is deleted by the existing scheduled maintenance. Uploads start unreferenced, so the grace period also covers an unsaved draft.
- Trash keeps attachments; restore from trash needs no extra work.

## Sync

- Metadata syncs as an immutable `attachment` kind through the existing push/pull (`sync/payloads.rs`), with tombstones and echo handling like notes. Received metadata is validated (uid and hash shape, allowed type, size limit) and ignored otherwise.
- Bytes move separately (`sync/blobs.rs`): `POST /api/sync/blobs/missing`, `PUT/GET /api/sync/blobs/{hash}`. A sync pushes metadata, uploads blobs the remote lacks, pulls, then downloads blobs it lacks. A metadata row may arrive before its bytes; the file reports 404 until a later sync fetches it, so an interrupted transfer just resumes. Downloads and uploads are verified against the SHA-256, the sniffed type and the size limit, and the server only accepts bytes that an attachment row references.
- `sync_blobs_sent` (device-local, cleared on disconnect) remembers which hashes the remote already has.

## Offline, export and backups

- Phones and desktops keep blobs locally after sync, so attachments work offline.
- Backups already include everything. The Markdown download of a note with attachments becomes a ZIP (`note.md` plus `attachments/`) with links rewritten relative; "Copy as Markdown" keeps the `attachment:` links.

## Phases

1. (Done: server, web) Server API + limits + lifecycle + tests; web upload (paste/drop/button), rendering and PDF links.
2. Backup/restore and export ZIP verification; orphan cleanup.
3. (Done) Sync kind and blob endpoints; cross-device tests (deletion, late bytes, tampering).
4. Mobile: pick/paste, render in the DOM renderer, offline.
