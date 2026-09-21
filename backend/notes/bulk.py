from collections.abc import Iterator

from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import Session, col

from db.models import Note, utcnow


class GroupDeleteResult(BaseModel):
    """What deleting a project or tag did to the notes that belonged to it."""

    # live notes moved to the trash (only when asked to delete them too)
    notes_trashed: int
    # live notes that were kept
    notes_kept: int


def trash_notes(session: Session, *conditions: ColumnElement[bool]) -> int:
    """Moves every live note matching `conditions` to the trash (soft delete,
    same as DELETE /notes/{id}) in one UPDATE, so a group of thousands is one
    statement rather than thousands of ORM round trips. Doesn't commit."""
    result = session.exec(  # type: ignore[call-overload]
        update(Note)
        .where(col(Note.deleted_at).is_(None), *conditions)
        .values(deleted_at=utcnow())
    )
    return result.rowcount


# One bulk request's ceiling. Also the most "select all matching" will ever
# grab, so the UI can say so instead of silently acting on a partial set.
MAX_BULK_IDS = 10_000
# SQLite's bound-parameter limit is per statement, so big id sets go in chunks.
_CHUNK = 900


def chunked(ids: list[int]) -> Iterator[list[int]]:
    for i in range(0, len(ids), _CHUNK):
        yield ids[i : i + _CHUNK]
