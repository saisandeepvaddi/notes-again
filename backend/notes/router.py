import datetime
from typing import cast

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlmodel import Session

from backend.db.models import Note, Reminder

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/list")
async def get_notes():
    return []


class NewNoteBody(BaseModel):
    name: str
    content: str
    reminder_dates: list[datetime.datetime] = [datetime.datetime.now(datetime.UTC)]
    username: str


@router.post("/create")
async def create_note(body: NewNoteBody, request: Request) -> None:
    session = cast(Session, request.app.state.session)
    note = Note(
        name=body.name,
        content=body.content,
        reminders=[Reminder(remind_at=reminder) for reminder in body.reminder_dates],
        user_id=1,
    )
    session.add(note)
    session.commit()
