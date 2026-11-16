# Plan: sync through your own storage (no server)

Status: proposed, not started. Replaces "host a sync server" as the default way to use more than one device. The existing server sync (`/api/sync/*`) stays for self-hosters and the web app.

## Why

A sync server asks users to run infrastructure. Most people already have storage they trust (iCloud Drive, OneDrive, Google Drive, Dropbox, or an S3-compatible bucket such as Cloudflare R2). The desktop app already owns the database, the merge logic and the sync state, so it can treat a dumb store as the shared medium.

## Model

Each device writes an append-only change log to a shared location and reads the other devices' logs. There is no central authority and no live connection between devices.

```
<root>/notes-again-vault/
  vault.json                    vault id, format version, optional encryption salt
  devices/<device-id>/
    00000001.json[.enc]         batch of changed rows (same payloads as /api/sync/push) + attachment hashes
    00000002.json[.enc]
    snapshot-<seq>.json[.enc]   periodic compaction so a new device does not replay everything
  blobs/<sha256>[.enc]          attachment bytes, content-addressed (dedupes, resumable)
```

- A device pushes by writing a new batch file (`put` is create-only, never overwrite), then reads every other device's new files since its stored cursor and applies them.
- Applying reuses the existing server-side apply and three-way merge (`sync/payloads.rs`, `sync/merge.rs`) with `sync_bases` as the base, so text conflicts still become `sync_conflicts` and reviews keep the earlier one. Tombstones travel as rows, as today.
- Rows apply with `sync_state.applying` so they are not echoed back, exactly like pulls from a server.
- Ordering needs no clocks: each row carries its `sync_version` and `uid`; ties resolve by device id. Batches are idempotent, so re-reading a file is safe.
- Compaction: a device may write a snapshot and delete its own older batches once every known device has passed them. Never delete another device's files.

## Backends

All implement one small trait (`list`, `get`, `put_if_absent`, `delete`), so sync logic is written once.

1. **Folder (first).** The user picks a folder. If it sits inside iCloud Drive, OneDrive, Dropbox or Google Drive for desktop, that product's own client moves the files. No OAuth, no secrets in our app, works offline, and covers the providers people actually name. Caveats: providers can briefly show partial files, so readers ignore files that fail to parse and retry on the next pass; writers write to a temp name and rename.
2. **S3-compatible (second).** Bucket, endpoint, region and access key through the `object_store` crate (Apache-2.0/MIT); covers S3, R2, B2, MinIO. Keys live in the OS keychain (the desktop app already has the credential vault), never in the synced database. Works from the phone too because it needs only HTTPS.
3. **Direct Google Drive / OneDrive APIs (only if folder sync proves not enough).** OAuth, app registration, review processes and token refresh make this the most expensive option; avoid unless users cannot use the desktop clients.

iCloud has no public server API, so it is reachable only as a folder on macOS/iOS.

## Security

- Optional end-to-end encryption from the first release of the S3 backend: a passphrase derives a key (Argon2id), batches and blobs are sealed with XChaCha20-Poly1305, and `vault.json` stores only the salt and a key check value. Folder sync benefits from it too. Losing the passphrase means losing the remote copy (the local database is unaffected); say so in the UI.
- Credentials are per device and never sync. Adding a device means entering the vault location and passphrase, or scanning a link from an existing device (like the phone pairing link).
- A hostile or corrupted batch must not be able to damage the database: the same validation as the server push path applies (uid and hash shape, type and size limits).

## Phases

1. Storage trait, batch format, folder backend, two-device tests on a temp folder (concurrent edits, deletion, offline catch-up, attachments, conflict, compaction); desktop UI in Settings → Sync ("Sync with a folder"); the server connection stays as the alternative.
2. S3-compatible backend and encryption; keychain storage for credentials.
3. Phone: iOS pairs through the same link; S3 first, folder via the document picker if feasible.
4. Re-evaluate Drive/OneDrive APIs.

## Open decisions

- Whether a device may use both a server and a storage vault at once. Recommendation: no, one sync target per device, switching asks for confirmation.
- Whether the web app (served by a server) is expected to sync with storage vaults. Recommendation: no; it keeps using its server.
- Snapshot cadence and retention (proposal: snapshot after 200 batches, keep two).
