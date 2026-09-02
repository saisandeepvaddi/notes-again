import datetime

from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class User(SQLModel, table=True):
    __tablename__ = "users"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    username: str = Field(default=None, unique=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    updated_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)

    notes: list["Note"] = Relationship(back_populates="user", cascade_delete=True)


class Note(SQLModel, table=True):
    __tablename__ = "notes"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    content: str = Field(index=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    updated_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)

    # 1 is default_user's user_id
    user_id: int | None = Field(default=1, foreign_key="users.id")
    user: User | None = Relationship(back_populates="notes")
    reminders: list["Reminder"] = Relationship(
        back_populates="note",
        cascade_delete=True,
    )


class Reminder(SQLModel, table=True):
    __tablename__ = "reminders"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    remind_at: datetime.datetime = Field(default_factory=utcnow)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    updated_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)

    note_id: int | None = Field(default=None, foreign_key="notes.id")
    note: Note | None = Relationship(back_populates="reminders")
