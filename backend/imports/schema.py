from typing import Any

from pydantic import BaseModel

from notes.schema import UTCDateTime


class ImportRequest(BaseModel):
    # The parsed contents of the user's import file (any JSON). Validated by
    # hand in service.normalize so problems come back as plain-string 400s
    # the frontend can show, rather than pydantic's 422 arrays.
    payload: Any
    # Fallback for anything the file doesn't set itself (file-level or per-deck `per_day`).
    per_day: int = 10
    default_deck: str | None = None
    tz_offset_minutes: int = 0
    dry_run: bool = False
    # Keep the notes out of review for now (reference material, a deck for
    # later); `per_day` pacing then applies when they're resumed instead.
    paused: bool = False


class ImportDeckSummary(BaseModel):
    name: str | None  # None = notes with no deck
    is_new: bool
    per_day: int  # how many of this deck's notes become due per day (0 = all now)
    to_create: int
    skipped: int


class ImportIssue(BaseModel):
    row: int
    name: str | None = None
    deck: str | None = None
    reason: str


class ImportResult(BaseModel):
    dry_run: bool
    # On a dry run: how many WOULD be created. Otherwise: how many were.
    notes_created: int
    duplicates_skipped: int
    invalid_skipped: int
    new_decks: int
    new_tags: int
    decks: list[ImportDeckSummary]
    first_due: UTCDateTime | None = None
    last_due: UTCDateTime | None = None
    due_today: int = 0
    days_span: int = 0
    paused: bool = False
    issues: list[ImportIssue]
    issues_truncated: bool = False
    warnings: list[str]
