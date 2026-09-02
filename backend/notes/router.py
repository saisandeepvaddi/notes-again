import datetime
from typing import cast

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.db.models import Note, Reminder
from backend.db.setup import SessionDep

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/list")
def get_notes(session: SessionDep) -> list[Note]:
    return list(session.exec(select(Note)))


class NewNoteBody(BaseModel):
    name: str
    content: str
    reminder_dates: list[datetime.datetime] = [datetime.datetime.now(datetime.UTC)]


@router.post("/create")
async def create_note(body: NewNoteBody, request: Request) -> Note:
    session = cast(Session, request.app.state.session)
    note = Note(
        name=body.name,
        content=body.content,
        reminders=[Reminder(remind_at=reminder) for reminder in body.reminder_dates],
        user_id=1,
    )
    session.add(note)
    session.commit()
    return note
