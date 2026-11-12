# Notes Again

> **Warning: this project is vibe-coded for personal use.** It is built with AI
> assistance for one person's daily workflow, with no support promises. Read
> the code, back up your data and expect rough edges before you rely on it.

A notebook that makes you remember what you wrote.

Write anything worth keeping as freeform Markdown, file it under projects and
tags, and Notes Again brings each note back for review on an FSRS or SM2
schedule, so it sticks instead of being written once and forgotten.

## How it differs from other notebooks

- **Spaced repetition on real notes.** Not flashcards: a note can be a full
  explanation with code blocks, and you rate recall (Again / Hard / Good / Easy)
  when it comes back. Notes you only want to keep can opt out of review.
- **Yours, on your machine.** One SQLite file, no account, no cloud. The
  desktop app works offline, and your devices sync through a server you run (or
  directly with your phone over Wi-Fi).
- **Plain Markdown in and out.** Copy or download any note (with its images and
  PDFs) as Markdown, import Anki-style decks and keep automatic backups.
- **AI only on your terms.** Optional "Discuss this note" uses your own
  OpenAI or Anthropic key, sends only the note you are viewing and saves
  nothing unless you confirm.
- **Capture and connect.** A browser extension clips pages or readable
  articles, notes link to each other with backlinks, and every note keeps a
  history you can compare and restore.

## Status

Working today: notes, projects, tags, review sessions, trash, attachments, note
history, note links and backlinks, single-note AI discussion, sync, and
the web, desktop, iOS and extension clients. Planned: chat across selected
notes or the whole library, favorites and saved searches, reading mode and
templates ([plan](docs/plans/knowledge-workflow.md)). Android is untested.

## Get it

**Desktop app** for macOS, Windows and Linux: download it from the
[latest release](https://github.com/saisandeepvaddi/notes-again/releases/latest).
It runs everything on your computer, needs no server, and checks for updates itself. The
builds aren't code-signed, so macOS and Windows ask you to confirm the first
launch; the release notes say how. Connect it to a server later
(Settings → Sync) to use the same notes on other devices.

## Run a server

For syncing between devices, the web app, and the mobile app. Pick one;
details for each are in [docs/self-hosting.md](docs/self-hosting.md).

**On your computer** (needs git, [Rust](https://rustup.rs), Node 22+ and pnpm):

```sh
git clone https://github.com/saisandeepvaddi/notes-again && cd notes-again
make run
```

**On a server, guided** (needs git, plus Docker or Rust/Node/pnpm; it asks which):

```sh
curl -fsSL https://raw.githubusercontent.com/saisandeepvaddi/notes-again/main/install.sh | sh
```

**With Docker Compose, by hand**:

```sh
git clone https://github.com/saisandeepvaddi/notes-again && cd notes-again
docker compose up -d --build
```

Every option builds from the source you cloned; there's no prebuilt image to
trust.

On first launch, sign in as `admin` with the temporary password printed in the
server output. You'll then choose your own username and password, turn login
off, or switch to Firebase sign-in.

## Develop

- Server: Rust (axum + sqlx) on SQLite (`server/`).
- Frontend: TanStack Start in SPA mode, TanStack Router and Query, Tailwind
  (`frontend/`).
- Extension: WXT (`extension/`).
- Mobile: Expo + React Native (`mobile/`).

```sh
make install
make dev-server     # API on :8000, login off
make dev-frontend   # Vite with hot reload on :5273
make check          # lint + typecheck
make test           # server, frontend, extension and e2e tests
```

[AGENTS.md](AGENTS.md) describes the layout and conventions.

## License

[MIT](LICENSE)
