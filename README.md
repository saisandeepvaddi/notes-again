# Notes Again

Spaced repetition for your own notes. Write anything worth remembering as
freeform markdown, organize it into projects and tags, and Notes Again brings
each note back for review on an FSRS or SM2 schedule so it sticks.

Self-hosted and single-user: one server process, one SQLite file, no outside
accounts.

- **Notes, not flashcards**: full markdown with code blocks, not a forced
  question-and-answer format.
- **Review sessions** rated Again / Hard / Good / Easy, scheduled with FSRS
  (default) or SM2, per note.
- **Projects and tags**, with a difficulty tag per note, pausing, and a trash
  you can restore from.
- **Browser extension** to save a page or a selection with one hotkey
  ([extension/](extension/README.md)).
- **Import** Anki-style decks from JSON, and export your notes back out.
- **Backups built in**: daily local snapshots, a one-click database download,
  and optional off-site streaming with Litestream.

## Run it

Pick one. Details for each are in [docs/self-hosting.md](docs/self-hosting.md).

**On your computer** (needs git, [uv](https://docs.astral.sh/uv/), Node 22+ and pnpm):

```sh
git clone https://github.com/saisandeepvaddi/notes-again && cd notes-again
make run
```

**On a server, guided** (needs git and Docker):

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

- Backend: FastAPI + SQLModel + SQLite, managed with uv (`backend/`).
- Frontend: TanStack Start in SPA mode, TanStack Router and Query, Tailwind
  (`frontend/`).
- Extension: WXT (`extension/`).

```sh
make install
make dev-backend    # API on :8000, login off
make dev-frontend   # Vite with hot reload on :5273
make check          # lint + typecheck
make test           # backend, extension and e2e tests
```

[AGENTS.md](AGENTS.md) describes the layout and conventions.

## License

[MIT](LICENSE)
