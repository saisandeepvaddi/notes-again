from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete
from sqlmodel import col, func, select

from db.models import Note, NoteTag, Tag
from db.setup import SessionDep
from notes.bulk import GroupDeleteResult, trash_notes

from .schema import TagListItem, TagResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("/list", response_model=list[TagListItem])
def get_tags(session: SessionDep):
    tags = session.exec(select(Tag).order_by(func.lower(Tag.name))).all()
    counts = dict(
        session.exec(
            select(NoteTag.tag_id, func.count())
            .join(Note, col(Note.id) == col(NoteTag.note_id))
            .where(col(Note.deleted_at).is_(None))
            .group_by(NoteTag.tag_id)
        ).all()
    )
    return [
        TagListItem(id=t.id, name=t.name, is_difficulty=t.is_difficulty, note_count=counts.get(t.id, 0))
        for t in tags
    ]


class NewTagBody(BaseModel):
    name: str


@router.post("/create", response_model=TagResponse)
def create_tag(body: NewTagBody, session: SessionDep):
    normalized = body.name.strip()
    if not normalized:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tag name cannot be empty")

    statement = select(Tag).where(func.lower(Tag.name) == normalized.lower())
    existing = session.exec(statement).one_or_none()
    if existing is not None:
        return existing

    tag = Tag(name=normalized)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


@router.delete("/{tag_id}", response_model=GroupDeleteResult)
def delete_tag(tag_id: int, session: SessionDep, delete_notes: bool = False):
    """Deletes the tag, removing it from every note that had it. The notes are
    kept unless `delete_notes`, which moves them to the trash instead."""
    tag = session.exec(select(Tag).where(Tag.id == tag_id)).one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    if tag.is_difficulty:
        # Every note carries exactly one; they set its starting ease factor.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Difficulty tags can't be deleted")

    tagged = col(Note.id).in_(select(NoteTag.note_id).where(col(NoteTag.tag_id) == tag_id))
    live_notes = session.exec(
        select(func.count()).select_from(Note).where(tagged, col(Note.deleted_at).is_(None))
    ).one()
    trashed = trash_notes(session, tagged) if delete_notes else 0

    session.exec(delete(NoteTag).where(col(NoteTag.tag_id) == tag_id))  # type: ignore[call-overload]
    session.exec(delete(Tag).where(col(Tag.id) == tag_id))  # type: ignore[call-overload]
    session.commit()
    return GroupDeleteResult(notes_trashed=trashed, notes_kept=live_notes - trashed)
