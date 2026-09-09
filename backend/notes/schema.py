import datetime
from typing import Annotated

from pydantic import PlainSerializer
from sqlmodel import SQLModel

from backend.notes.utils import to_utc_iso
from backend.tags.schema import TagResponse

UTCDateTime = Annotated[datetime.datetime, PlainSerializer(to_utc_iso, return_type=str)]


class ReminderResponse(SQLModel):
    id: int
    remind_at: UTCDateTime
    reviewed_at: UTCDateTime | None = None
    rating: str | None = None


class NoteResponse(SQLModel):
    id: int
    name: str
    content: str
    created_at: UTCDateTime
    updated_at: UTCDateTime
    ease_factor: float
    interval_days: int
    reminders: list[ReminderResponse] = []
    tags: list[TagResponse] = []
