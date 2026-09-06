import datetime
from typing import Any, cast

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
def get_notes(session: SessionDep):
    notes = session.exec(
        select(Note)
        .where(col(Note.deleted_at).is_(None))
        .options(selectinload(cast(Any, Note.reminders)))
    ).all()
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
    note = session.exec(select(Note).where(Note.id == note_id)).one()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    note.deleted_at = datetime.datetime.now(datetime.UTC)
    session.commit()
