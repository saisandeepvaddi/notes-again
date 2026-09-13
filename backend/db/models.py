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


class NoteTag(SQLModel, table=True):
    __tablename__ = "note_tags"  # type: ignore
    note_id: int | None = Field(default=None, foreign_key="notes.id", primary_key=True)
    tag_id: int | None = Field(default=None, foreign_key="tags.id", primary_key=True)


class Tag(SQLModel, table=True):
    __tablename__ = "tags"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)

    # difficulty tags (Easy/Medium/Hard) are seeded built-ins, sticky on every
    # note, and set a note's starting SM-2 ease factor when applied
    is_difficulty: bool = Field(default=False)
    default_ease_factor: float | None = Field(default=None)

    notes: list["Note"] = Relationship(back_populates="tags", link_model=NoteTag)


class Project(SQLModel, table=True):
    """A note's grouping -- a separate concept from tags, not a kind of tag:
    its own name namespace, its own table, one per note (a foreign key on
    Note, not a many-to-many)."""

    __tablename__ = "projects"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)

    notes: list["Note"] = Relationship(back_populates="project")


class Note(SQLModel, table=True):
    __tablename__ = "notes"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    content: str = Field(index=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    updated_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)

    # spaced-repetition state (SM-2-lite), advanced on each review
    ease_factor: float = Field(default=2.5)
    interval_days: int = Field(default=0)

    # 1 is default_user's user_id
    user_id: int | None = Field(default=1, foreign_key="users.id")
    user: User | None = Relationship(back_populates="notes")
    reminders: list["Reminder"] = Relationship(
        back_populates="note",
        cascade_delete=True,
    )
    tags: list["Tag"] = Relationship(back_populates="notes", link_model=NoteTag)

    project_id: int | None = Field(default=None, foreign_key="projects.id")
    project: Project | None = Relationship(back_populates="notes")


class Reminder(SQLModel, table=True):
    __tablename__ = "reminders"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    remind_at: datetime.datetime = Field(default_factory=utcnow)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    updated_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)
    reviewed_at: datetime.datetime | None = Field(default=None)
    rating: str | None = Field(default=None)

    # snapshot of the note's SM-2 state before this reminder was created, used to undo a review
    ease_factor: float | None = Field(default=None)
    interval_days: int | None = Field(default=None)

    note_id: int | None = Field(default=None, foreign_key="notes.id")
    note: Note | None = Relationship(back_populates="reminders")
