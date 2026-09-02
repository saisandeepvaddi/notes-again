import datetime
from typing import Any, cast

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import select

from backend.db.models import Note, Reminder
from backend.db.setup import SessionDep

from .schema import NoteResponse

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/list", response_model=list[NoteResponse])
def get_notes(session: SessionDep):
    notes = session.exec(
        select(Note).options(selectinload(cast(Any, Note.reminders)))
    ).all()
    return notes


class NewNoteBody(BaseModel):
    name: str
    content: str
    reminder_dates: list[datetime.datetime] = [datetime.datetime.now(datetime.UTC)]


@router.post("/create", response_model=NoteResponse)
async def create_note(body: NewNoteBody, session: SessionDep):
    note = Note(
        name=body.name,
        content=body.content,
        reminders=[Reminder(remind_at=reminder) for reminder in body.reminder_dates],
        user_id=1,
    )
    session.add(note)
    session.commit()
    session.refresh(note, attribute_names=["reminders"])
    return note
