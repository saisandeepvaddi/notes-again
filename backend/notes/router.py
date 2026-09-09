import datetime
from typing import Any, Literal, cast

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import selectinload
from sqlmodel import col, select

from backend.notes.utils import to_utc
from db.models import Note, Reminder, utcnow
from db.setup import SessionDep

from .schema import NoteResponse

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/list", response_model=list[NoteResponse])
def get_notes(
    session: SessionDep,
    start: datetime.datetime | None = None,
    end: datetime.datetime | None = None,
):
    if start is not None and end is not None:
        start_utc = to_utc(start).replace(tzinfo=None)
        end_utc = to_utc(end).replace(tzinfo=None)
        statement = (
            select(Reminder)
            .join(Note, col(Reminder.note_id) == col(Note.id))
            .where(
                col(Reminder.remind_at) >= start_utc,
                col(Reminder.remind_at) < end_utc,
                col(Note.deleted_at).is_(None),
                col(Reminder.deleted_at).is_(None),
            )
        )
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
        .where(
            col(Note.deleted_at).is_(None),
        )
        .options(selectinload(cast(Any, Note.reminders)))
    )
    notes = list(session.exec(statement=statement).all())
    return notes


class NewNoteBody(BaseModel):
    name: str
    content: str
    reminder_dates: list[datetime.datetime] = Field(default_factory=lambda: [utcnow()])


@router.post("/create", response_model=NoteResponse)
def create_note(body: NewNoteBody, session: SessionDep):
    note = Note(
        name=body.name,
        content=body.content,
        reminders=[
            Reminder(remind_at=to_utc(reminder)) for reminder in body.reminder_dates
        ],
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


class PatchReminderBody(BaseModel):
    action: Literal["review", "undo_review"]


@router.patch("/reminders/{reminder_id}/now", response_model=NoteResponse)
def patch_note_reminder(reminder_id: int, body: PatchReminderBody, session: SessionDep):
    statement = select(Reminder).where(Reminder.id == reminder_id)
    reminder = session.exec(statement=statement).one_or_none()
    if reminder is None or reminder.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reminder not found")
    reminder.reviewed_at = utcnow() if body.action == "review" else None
    session.commit()
    session.refresh(reminder)
    session.refresh(reminder.note)
    return reminder.note
