import datetime
from typing import Annotated

from pydantic import PlainSerializer
from sqlmodel import SQLModel


def _to_utc_iso(dt: datetime.datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.UTC)
    else:
        dt = dt.astimezone(datetime.UTC)
    return dt.isoformat()


UTCDateTime = Annotated[
    datetime.datetime, PlainSerializer(_to_utc_iso, return_type=str)
]


class ReminderResponse(SQLModel):
    id: int
    remind_at: UTCDateTime


class NoteResponse(SQLModel):
    id: int
    name: str
    content: str
    created_at: UTCDateTime
    updated_at: UTCDateTime
    reminders: list[ReminderResponse] = []
