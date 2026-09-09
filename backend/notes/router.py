import datetime
from typing import Any, Literal, cast

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import selectinload
from sqlmodel import col, select

from backend.notes.srs import Rating, compute_next_review
from backend.notes.utils import to_utc
from db.models import Note, NoteTag, Reminder, Tag, utcnow
from db.setup import SessionDep

from .schema import NoteResponse

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/list", response_model=list[NoteResponse])
def get_notes(
    session: SessionDep,
    start: datetime.datetime | None = None,
    end: datetime.datetime | None = None,
    tag_id: int | None = None,
    deleted: bool = False,
):
    deleted_filter = (
        col(Note.deleted_at).is_not(None) if deleted else col(Note.deleted_at).is_(None)
    )

    if start is not None and end is not None:
        start_utc = to_utc(start).replace(tzinfo=None)
        end_utc = to_utc(end).replace(tzinfo=None)
        statement = (
            select(Reminder)
            .join(Note, col(Reminder.note_id) == col(Note.id))
            .where(
                col(Reminder.remind_at) >= start_utc,
                col(Reminder.remind_at) < end_utc,
                deleted_filter,
                col(Reminder.deleted_at).is_(None),
            )
        )
        if tag_id is not None:
            statement = statement.join(
                NoteTag, col(NoteTag.note_id) == col(Note.id)
            ).where(col(NoteTag.tag_id) == tag_id)
        reminders = session.exec(statement).all()
        seen = set()
        notes: list[Note] = []
        for reminder in reminders:
            if reminder.note is not None and reminder.note.id not in seen:
                notes.append(reminder.note)
                seen.add(reminder.note.id)
        return notes

    statement = (
        select(Note)
        .where(deleted_filter)
        .options(
            selectinload(cast(Any, Note.reminders)),
            selectinload(cast(Any, Note.tags)),
        )
    )
    if tag_id is not None:
        statement = statement.join(NoteTag, col(NoteTag.note_id) == col(Note.id)).where(
            col(NoteTag.tag_id) == tag_id
        )
    notes = list(session.exec(statement=statement).all())
    return notes


@router.get("/due", response_model=list[NoteResponse])
def get_due_notes(session: SessionDep):
    # Joined via Reminder (not a plain Note select) and deduped below: notes
    # created under the old fixed-schedule model can still have more than one
    # pending reminder due at once until they've gone through one review.
    statement = (
        select(Reminder)
        .join(Note, col(Reminder.note_id) == col(Note.id))
        .where(
            col(Note.deleted_at).is_(None),
            col(Reminder.deleted_at).is_(None),
            col(Reminder.reviewed_at).is_(None),
            col(Reminder.remind_at) <= utcnow(),
        )
        .order_by(col(Reminder.remind_at).asc())
    )
    reminders = session.exec(statement).all()
    seen: set[int] = set()
    notes: list[Note] = []
    for reminder in reminders:
        if reminder.note is not None and reminder.note.id not in seen:
            notes.append(reminder.note)
            seen.add(cast(int, reminder.note.id))
    return notes


class NewNoteBody(BaseModel):
    name: str
    content: str
    first_reminder_at: datetime.datetime = Field(default_factory=utcnow)
    tag_ids: list[int] = Field(default_factory=list)


@router.post("/create", response_model=NoteResponse)
def create_note(body: NewNoteBody, session: SessionDep):
    tags: list[Tag] = []
    if body.tag_ids:
        tags = list(session.exec(select(Tag).where(col(Tag.id).in_(body.tag_ids))).all())

    note = Note(
        name=body.name,
        content=body.content,
        ease_factor=2.5,
        interval_days=0,
        reminders=[
            Reminder(
                remind_at=to_utc(body.first_reminder_at),
                ease_factor=2.5,
                interval_days=0,
            )
        ],
        tags=tags,
        user_id=1,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    note.deleted_at = utcnow()
    session.commit()


@router.patch("/{note_id}/restore", response_model=NoteResponse)
def restore_note(note_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found in trash")
    note.deleted_at = None
    session.commit()
    session.refresh(note)
    return note


@router.delete("/{note_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanently_delete_note(note_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    session.delete(note)
    session.commit()


@router.post("/{note_id}/tags/{tag_id}", response_model=NoteResponse)
def attach_tag(note_id: int, tag_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    tag = session.exec(select(Tag).where(Tag.id == tag_id)).one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    if tag not in note.tags:
        note.tags.append(tag)
        session.add(note)
        session.commit()
        session.refresh(note)
    return note


@router.delete("/{note_id}/tags/{tag_id}", response_model=NoteResponse)
def detach_tag(note_id: int, tag_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    note.tags = [tag for tag in note.tags if tag.id != tag_id]
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


class PatchReminderBody(BaseModel):
    action: Literal["review", "undo_review"]
    rating: Rating | None = None


@router.patch("/reminders/{reminder_id}/now", response_model=NoteResponse)
def patch_note_reminder(reminder_id: int, body: PatchReminderBody, session: SessionDep):
    reminder = session.exec(
        select(Reminder).where(Reminder.id == reminder_id)
    ).one_or_none()
    if reminder is None or reminder.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reminder not found")
    note = reminder.note
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    if body.action == "review":
        if body.rating is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "rating is required to review")

        new_ease, new_interval = compute_next_review(
            note.ease_factor, note.interval_days, body.rating
        )
        reminder.reviewed_at = utcnow()
        reminder.rating = body.rating
        note.ease_factor = new_ease
        note.interval_days = new_interval
        next_reminder = Reminder(
            note_id=note.id,
            remind_at=utcnow() + datetime.timedelta(days=new_interval),
            ease_factor=new_ease,
            interval_days=new_interval,
        )
        session.add_all([reminder, note, next_reminder])
        session.commit()
        session.refresh(note)
        return note

    # undo_review
    if reminder.reviewed_at is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reminder was not reviewed")

    latest_reviewed = session.exec(
        select(Reminder)
        .where(
            col(Reminder.note_id) == note.id,
            col(Reminder.reviewed_at).is_not(None),
        )
        .order_by(col(Reminder.reviewed_at).desc())
    ).first()
    if latest_reviewed is None or latest_reviewed.id != reminder.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Only the most recent review can be undone"
        )

    pending = session.exec(
        select(Reminder).where(
            col(Reminder.note_id) == note.id,
            col(Reminder.reviewed_at).is_(None),
        )
    ).one_or_none()
    if pending is not None:
        session.delete(pending)

    if reminder.ease_factor is not None:
        note.ease_factor = reminder.ease_factor
    if reminder.interval_days is not None:
        note.interval_days = reminder.interval_days
    reminder.reviewed_at = None
    reminder.rating = None
    session.add_all([reminder, note])
    session.commit()
    session.refresh(note)
    return note
