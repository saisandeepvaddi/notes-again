from typing import Any

from pydantic import BaseModel

from notes.schema import UTCDateTime


class ImportRequest(BaseModel):
    payload: Any
    per_day: int = 10
    default_deck: str | None = None
    tz_offset_minutes: int = 0
    dry_run: bool = False
    paused: bool = False
    in_review: bool = True


class ImportDeckSummary(BaseModel):
    name: str | None
    is_new: bool
    per_day: int
    to_create: int
    skipped: int


class ImportIssue(BaseModel):
    row: int
    name: str | None = None
    deck: str | None = None
    reason: str


class ImportResult(BaseModel):
    dry_run: bool
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
    note_only: bool = False
    restored_reviews: int = 0
    issues: list[ImportIssue]
    issues_truncated: bool = False
    warnings: list[str]


class ExportRequest(BaseModel):
    project_ids: list[int] = []
    include_no_project: bool = False
    tag_ids: list[int] = []
    note_ids: list[int] | None = None
    include_paused: bool = True
    include_review: bool = True


class ExportCount(BaseModel):
    notes: int
    decks: int
