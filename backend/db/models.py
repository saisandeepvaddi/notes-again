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

    is_difficulty: bool = Field(default=False)
    default_ease_factor: float | None = Field(default=None)

    notes: list["Note"] = Relationship(back_populates="tags", link_model=NoteTag)


class Project(SQLModel, table=True):
    __tablename__ = "projects"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)

    paused: bool = Field(default=False)

    notes: list["Note"] = Relationship(back_populates="project")


class Note(SQLModel, table=True):
    __tablename__ = "notes"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    content: str = Field(index=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    updated_at: datetime.datetime = Field(default_factory=utcnow)
    deleted_at: datetime.datetime | None = Field(default=None)

    paused_at: datetime.datetime | None = Field(default=None)

    ease_factor: float = Field(default=2.5)
    interval_days: int = Field(default=0)

    algorithm: str = Field(default="sm2")

    fsrs_card: str | None = Field(default=None)

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

    ease_factor: float | None = Field(default=None)
    interval_days: int | None = Field(default=None)
    fsrs_card: str | None = Field(default=None)

    note_id: int | None = Field(default=None, foreign_key="notes.id")
    note: Note | None = Relationship(back_populates="reminders")


class Settings(SQLModel, table=True):
    __tablename__ = "settings"  # type: ignore
    id: int = Field(default=1, primary_key=True)
    default_algorithm: str = Field(default="fsrs")


class ApiToken(SQLModel, table=True):
    __tablename__ = "api_tokens"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    name: str
    token_hash: str = Field(unique=True, index=True)
    prefix: str
    scope: str = Field(default="capture")
    created_by: str | None = Field(default=None)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    last_used_at: datetime.datetime | None = Field(default=None)
    expires_at: datetime.datetime | None = Field(default=None)
    revoked_at: datetime.datetime | None = Field(default=None)


class LocalAuth(SQLModel, table=True):
    __tablename__ = "local_auth"  # type: ignore
    id: int = Field(default=1, primary_key=True)
    username: str
    password_hash: str
    enabled: bool = Field(default=True)
    setup_completed: bool = Field(default=False)
    initial_password: str | None = Field(default=None)
    updated_at: datetime.datetime = Field(default_factory=utcnow)


class AuthSession(SQLModel, table=True):
    __tablename__ = "auth_sessions"  # type: ignore
    id: int = Field(default=None, primary_key=True)
    token_hash: str = Field(unique=True, index=True)
    created_at: datetime.datetime = Field(default_factory=utcnow)
    last_used_at: datetime.datetime = Field(default_factory=utcnow)
    expires_at: datetime.datetime
