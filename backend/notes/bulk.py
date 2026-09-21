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
