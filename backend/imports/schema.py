from typing import Any

from pydantic import BaseModel

from notes.schema import UTCDateTime


class ImportRequest(BaseModel):
    # The parsed contents of the user's import file (any JSON). Validated by
    # hand in service.normalize so problems come back as plain-string 400s
    # the frontend can show, rather than pydantic's 422 arrays.
    payload: Any
    per_day: int = 20
    default_deck: str | None = None
    tz_offset_minutes: int = 0
    dry_run: bool = False


class ImportDeckSummary(BaseModel):
    name: str | None  # None = notes with no deck
    is_new: bool
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
    days_span: int = 0
    issues: list[ImportIssue]
    issues_truncated: bool = False
    warnings: list[str]
