import datetime

from sqlmodel import SQLModel


class ReminderResponse(SQLModel):
    id: int
    remind_at: datetime.datetime


class NoteResponse(SQLModel):
    id: int
    name: str
    content: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    reminders: list[ReminderResponse] = []
