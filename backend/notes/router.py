import datetime
from typing import Any, Literal, cast

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from db.models import Note, NoteTag, Project, Reminder, Settings, Tag, utcnow
from db.setup import SessionDep
from notes.bulk import MAX_BULK_IDS
from notes.factory import build_note
from notes.scheduling import (
    Algorithm,
    Rating,
    restore_from_snapshot,
    review_note,
    snapshot_for_new_reminder,
)
from notes.utils import to_utc
from tags.difficulty import DIFFICULTY_TAGS, Difficulty

from .schema import NotePage, NoteResponse

router = APIRouter(prefix="/notes", tags=["notes"])


def get_difficulty_tag(session: Session, difficulty: Difficulty) -> Tag:
    name = DIFFICULTY_TAGS[difficulty].name
    tag = session.exec(select(Tag).where(Tag.name == name)).one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Difficulty tag missing")
    return tag


def apply_difficulty(session: Session, note: Note, difficulty: Difficulty) -> Tag:
    tag = get_difficulty_tag(session, difficulty)
    note.tags = [t for t in note.tags if not t.is_difficulty] + [tag]
    note.ease_factor = tag.default_ease_factor or note.ease_factor
    return tag


def get_project(session: Session, project_id: int) -> Project:
    project = session.exec(
        select(Project).where(Project.id == project_id, col(Project.deleted_at).is_(None))
    ).one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


def get_default_algorithm(session: Session) -> Algorithm:
    settings = session.get(Settings, 1)
    algorithm = settings.default_algorithm if settings is not None else "fsrs"
    return cast(Algorithm, algorithm)


NoteSort = Literal["due", "name", "project", "created", "difficulty"]

MAX_PAGE_SIZE = 200


def _next_due():
    return (
        select(func.min(Reminder.remind_at))
        .where(
            col(Reminder.note_id) == col(Note.id),
            col(Reminder.reviewed_at).is_(None),
            col(Reminder.deleted_at).is_(None),
        )
        .correlate(Note)
        .scalar_subquery()
    )


def _sort_key(sort: NoteSort):
    if sort == "name":
        return func.lower(Note.name)
    if sort == "project":
        return (
            select(func.lower(Project.name))
            .where(col(Project.id) == col(Note.project_id))
            .correlate(Note)
            .scalar_subquery()
        )
    if sort == "created":
        return col(Note.created_at)
    if sort == "difficulty":
        rank = case(
            {defaults.name: i for i, defaults in enumerate(DIFFICULTY_TAGS.values())},
            value=col(Tag.name),
        )
        return (
            select(func.min(rank))
            .join(NoteTag, col(NoteTag.tag_id) == col(Tag.id))
            .where(col(NoteTag.note_id) == col(Note.id), col(Tag.is_difficulty).is_(True))
            .correlate(Note)
            .scalar_subquery()
        )
    return _next_due()


def _notes_page(
    session: Session,
    conditions: list,
    *,
    sort: NoteSort,
    order: Literal["asc", "desc"],
    limit: int,
    offset: int,
) -> NotePage:
    total = session.exec(select(func.count()).select_from(Note).where(*conditions)).one()
    key = _sort_key(sort)
    direction = key.asc() if order == "asc" else key.desc()
    statement = (
        select(Note)
        .where(*conditions)
        .order_by(direction.nulls_last(), col(Note.id).asc())
        .limit(limit)
        .offset(offset)
        .options(
            selectinload(cast(Any, Note.reminders)),
            selectinload(cast(Any, Note.tags)),
            selectinload(cast(Any, Note.project)),
        )
    )
    return NotePage(items=list(session.exec(statement).all()), total=total)


def _list_conditions(
    *,
    start: datetime.datetime | None,
    end: datetime.datetime | None,
    tag_id: int | None,
    project_id: int | None,
    deleted: bool,
    search: str | None = None,
    paused: bool | None = None,
) -> list:
    conditions: list = [
        col(Note.deleted_at).is_not(None) if deleted else col(Note.deleted_at).is_(None)
    ]

    if paused is not None:
        conditions.append(
            col(Note.paused_at).is_not(None) if paused else col(Note.paused_at).is_(None)
        )

    if search:
        term = f"%{search.strip()}%"
        conditions.append(
            or_(
                col(Note.name).ilike(term),
                func.title_text(Note.name).ilike(term),
                col(Note.content).ilike(term),
            )
        )

    if start is not None and end is not None:
        conditions.append(col(Note.paused_at).is_(None))
        start_utc = to_utc(start).replace(tzinfo=None)
        end_utc = to_utc(end).replace(tzinfo=None)

        in_range = and_(col(Reminder.remind_at) >= start_utc, col(Reminder.remind_at) < end_utc)
        if start_utc <= utcnow().replace(tzinfo=None) < end_utc:
            remind_at_filter = or_(
                in_range,
                and_(col(Reminder.remind_at) < start_utc, col(Reminder.reviewed_at).is_(None)),
            )
        else:
            remind_at_filter = in_range
        conditions.append(
            select(Reminder.id)
            .where(
                col(Reminder.note_id) == col(Note.id),
                col(Reminder.deleted_at).is_(None),
                remind_at_filter,
            )
            .exists()
        )
    if tag_id is not None:
        conditions.append(
            col(Note.id).in_(select(NoteTag.note_id).where(col(NoteTag.tag_id) == tag_id))
        )
    if project_id is not None:
        conditions.append(col(Note.project_id) == project_id)
    return conditions


@router.get("/list", response_model=NotePage)
def get_notes(
    session: SessionDep,
    start: datetime.datetime | None = None,
    end: datetime.datetime | None = None,
    tag_id: int | None = None,
    project_id: int | None = None,
    deleted: bool = False,
    search: str | None = None,
    paused: bool | None = None,
    sort: NoteSort = "due",
    order: Literal["asc", "desc"] = "asc",
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
):
    conditions = _list_conditions(
        start=start,
        end=end,
        tag_id=tag_id,
        project_id=project_id,
        deleted=deleted,
        search=search,
        paused=paused,
    )
    return _notes_page(session, conditions, sort=sort, order=order, limit=limit, offset=offset)


class NoteIds(BaseModel):
    ids: list[int]
    total: int


@router.get("/ids", response_model=NoteIds)
def get_note_ids(
    session: SessionDep,
    start: datetime.datetime | None = None,
    end: datetime.datetime | None = None,
    tag_id: int | None = None,
    project_id: int | None = None,
    deleted: bool = False,
    search: str | None = None,
    paused: bool | None = None,
    sort: NoteSort = "due",
    order: Literal["asc", "desc"] = "asc",
):
    conditions = _list_conditions(
        start=start,
        end=end,
        tag_id=tag_id,
        project_id=project_id,
        deleted=deleted,
        search=search,
        paused=paused,
    )
    total = session.exec(select(func.count()).select_from(Note).where(*conditions)).one()
    key = _sort_key(sort)
    direction = key.asc() if order == "asc" else key.desc()
    ids = session.exec(
        select(Note.id)
        .where(*conditions)
        .order_by(direction.nulls_last(), col(Note.id).asc())
        .limit(MAX_BULK_IDS)
    ).all()
    return NoteIds(ids=list(ids), total=total)


@router.get("/due", response_model=NotePage)
def get_due_notes(
    session: SessionDep,
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
):
    conditions: list = [
        col(Note.deleted_at).is_(None),
        col(Note.paused_at).is_(None),
        select(Reminder.id)
        .where(
            col(Reminder.note_id) == col(Note.id),
            col(Reminder.deleted_at).is_(None),
            col(Reminder.reviewed_at).is_(None),
            col(Reminder.remind_at) <= utcnow(),
        )
        .exists(),
    ]
    return _notes_page(session, conditions, sort="due", order="asc", limit=limit, offset=offset)


@router.get("/{note_id}", response_model=NoteResponse)
def get_note(note_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return note


class NewNoteBody(BaseModel):
    name: str
    content: str
    first_reminder_at: datetime.datetime = Field(default_factory=utcnow)
    tag_ids: list[int] = Field(default_factory=list)
    difficulty: Difficulty = "medium"
    project_id: int | None = None
    paused: bool | None = None


@router.post("/create", response_model=NoteResponse)
def create_note(body: NewNoteBody, session: SessionDep):
    tags: list[Tag] = []
    if body.tag_ids:
        tags = list(session.exec(select(Tag).where(col(Tag.id).in_(body.tag_ids))).all())
    tags = [tag for tag in tags if not tag.is_difficulty]

    project = get_project(session, body.project_id) if body.project_id is not None else None
    paused = body.paused if body.paused is not None else project is not None and project.paused
    note = build_note(
        name=body.name,
        content=body.content,
        algorithm=get_default_algorithm(session),
        difficulty_tag=get_difficulty_tag(session, body.difficulty),
        tags=tags,
        project=project,
        first_reminder_at=to_utc(body.first_reminder_at),
        paused=paused,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


class UpdateNoteBody(BaseModel):
    name: str
    content: str


@router.patch("/{note_id}", response_model=NoteResponse)
def update_note(note_id: int, body: UpdateNoteBody, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    note.name = body.name
    note.content = body.content
    note.updated_at = utcnow()
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


@router.delete("/trash", status_code=status.HTTP_204_NO_CONTENT)
def empty_trash(session: SessionDep):
    notes = session.exec(select(Note).where(col(Note.deleted_at).is_not(None))).all()
    for note in notes:
        session.delete(note)
    session.commit()


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    note.deleted_at = utcnow()
    session.commit()


@router.patch("/{note_id}/restore", response_model=NoteResponse)
def restore_note(note_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found in trash")
    note.deleted_at = None
    session.commit()
    session.refresh(note)
    return note


@router.delete("/{note_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanently_delete_note(note_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    session.delete(note)
    session.commit()


@router.post("/{note_id}/tags/{tag_id}", response_model=NoteResponse)
def attach_tag(note_id: int, tag_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    tag = session.exec(select(Tag).where(Tag.id == tag_id)).one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    if tag.is_difficulty:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Use PATCH /notes/{note_id}/difficulty to change a note's difficulty",
        )
    if tag not in note.tags:
        note.tags.append(tag)
        session.add(note)
        session.commit()
        session.refresh(note)
    return note


@router.delete("/{note_id}/tags/{tag_id}", response_model=NoteResponse)
def detach_tag(note_id: int, tag_id: int, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    target = next((tag for tag in note.tags if tag.id == tag_id), None)
    if target is not None and target.is_difficulty:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Difficulty tags can't be removed directly")
    note.tags = [tag for tag in note.tags if tag.id != tag_id]
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


class SetDifficultyBody(BaseModel):
    difficulty: Difficulty


@router.patch("/{note_id}/difficulty", response_model=NoteResponse)
def set_note_difficulty(note_id: int, body: SetDifficultyBody, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    apply_difficulty(session, note, body.difficulty)
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


class SetProjectBody(BaseModel):
    project_id: int | None = None


@router.patch("/{note_id}/project", response_model=NoteResponse)
def set_note_project(note_id: int, body: SetProjectBody, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    note.project = get_project(session, body.project_id) if body.project_id is not None else None
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


class SetPausedBody(BaseModel):
    paused: bool


@router.patch("/{note_id}/paused", response_model=NoteResponse)
def set_note_paused(note_id: int, body: SetPausedBody, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    if body.paused != (note.paused_at is not None):
        note.paused_at = utcnow() if body.paused else None
        session.add(note)
        session.commit()
        session.refresh(note)
    return note


class RescheduleReminderBody(BaseModel):
    remind_at: datetime.datetime


@router.patch("/{note_id}/reminders/pending", response_model=NoteResponse)
def reschedule_pending_reminder(note_id: int, body: RescheduleReminderBody, session: SessionDep):
    note = session.exec(select(Note).where(Note.id == note_id)).one_or_none()
    if note is None or note.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    pending = session.exec(
        select(Reminder).where(
            col(Reminder.note_id) == note.id,
            col(Reminder.deleted_at).is_(None),
            col(Reminder.reviewed_at).is_(None),
        )
    ).one_or_none()
    if pending is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note has no pending reminder")

    pending.remind_at = to_utc(body.remind_at)
    session.add(pending)
    session.commit()
    session.refresh(note)
    return note


class PatchReminderBody(BaseModel):
    action: Literal["review", "undo_review"]
    rating: Rating | None = None


@router.patch("/reminders/{reminder_id}/now", response_model=NoteResponse)
def patch_note_reminder(reminder_id: int, body: PatchReminderBody, session: SessionDep):
    reminder = session.exec(
        select(Reminder).where(Reminder.id == reminder_id)
    ).one_or_none()
    if reminder is None or reminder.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reminder not found")
    note = reminder.note
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")

    if body.action == "review":
        if body.rating is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "rating is required to review")

        due_at = review_note(note, body.rating)

        reminder.reviewed_at = utcnow()
        reminder.rating = body.rating
        next_reminder = Reminder(
            note_id=note.id, remind_at=due_at, **snapshot_for_new_reminder(note)
        )
        session.add_all([reminder, note, next_reminder])
        session.commit()
        session.refresh(note)
        return note

    if reminder.reviewed_at is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reminder was not reviewed")

    latest_reviewed = session.exec(
        select(Reminder)
        .where(
            col(Reminder.note_id) == note.id,
            col(Reminder.reviewed_at).is_not(None),
        )
        .order_by(col(Reminder.reviewed_at).desc())
    ).first()
    if latest_reviewed is None or latest_reviewed.id != reminder.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Only the most recent review can be undone"
        )

    pending = session.exec(
        select(Reminder).where(
            col(Reminder.note_id) == note.id,
            col(Reminder.reviewed_at).is_(None),
        )
    ).one_or_none()
    if pending is not None:
        session.delete(pending)

    restore_from_snapshot(note, reminder)
    reminder.reviewed_at = None
    reminder.rating = None
    session.add_all([reminder, note])
    session.commit()
    session.refresh(note)
    return note
