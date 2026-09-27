from sqlalchemy import delete
from sqlalchemy.sql import Select
from sqlmodel import Session, col, select

from db.models import Note, NoteTag, Tag
from notes.bulk import chunked


def delete_unused_tags(session: Session, among: Select | None = None) -> int:
    in_use = (
        select(NoteTag.tag_id)
        .join(Note, col(Note.id) == col(NoteTag.note_id))
        .where(col(Note.deleted_at).is_(None))
    )
    unused = select(Tag.id).where(col(Tag.is_difficulty).is_(False), col(Tag.id).not_in(in_use))
    if among is not None:
        unused = unused.where(col(Tag.id).in_(among))
    ids = [tag_id for tag_id in session.exec(unused).all() if tag_id is not None]

    for chunk in chunked(ids):
        session.exec(delete(NoteTag).where(col(NoteTag.tag_id).in_(chunk)))  # type: ignore[call-overload]
        session.exec(delete(Tag).where(col(Tag.id).in_(chunk)))  # type: ignore[call-overload]
    return len(ids)
