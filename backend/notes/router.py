import datetime

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/list")
async def get_notes():
    return []


class NewNoteBody(BaseModel):
    name: str
    content: str
    include_today: bool = True
    reminder_dates: list[datetime.datetime] = [datetime.datetime.now(datetime.UTC)]


@router.post("/create")
async def create_note(body: NewNoteBody):

    print(body)
