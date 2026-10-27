from sqlmodel import SQLModel

from notes.bulk import ReviewStatus
from notes.schema import UTCDateTime
from projects.schema import ProjectResponse


class NoteHit(SQLModel):
    id: int
    title: str
    title_marked: str
    snippet: str
    project: ProjectResponse | None = None
    status: ReviewStatus
    updated_at: UTCDateTime


class NamedHit(SQLModel):
    id: int
    name: str
    name_marked: str
    note_count: int


class SearchResults(SQLModel):
    notes: list[NoteHit]
    projects: list[NamedHit]
    tags: list[NamedHit]
