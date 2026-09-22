import datetime
from typing import Any, Literal, cast

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
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
    """Sets a note's difficulty tag (swapping out any existing one) and syncs
    its ease factor to match. This is the only lever on review pacing now —
    there's no separate per-review rating scale."""
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


NoteSort = Literal["due", "name", "project", "created"]

MAX_PAGE_SIZE = 200


def _next_due():
    """Correlated subquery: when this note's pending reminder is due."""
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
    """One page of notes matching `conditions`, plus the total match count.

    Every filter is an EXISTS/IN predicate on Note itself (never a join that
    can fan out to several rows per note), so LIMIT/OFFSET and the count are
    exact, and reminders/tags/project are eager-loaded (no per-note queries).
    """
    total = session.exec(select(func.count()).select_from(Note).where(*conditions)).one()
    key = _sort_key(sort)
    direction = key.asc() if order == "asc" else key.desc()
    statement = (
        select(Note)
        .where(*conditions)
        # notes with no value (no pending reminder / no project) always last
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
) -> list:
    """The WHERE conditions shared by /list and /ids, so "select all N
    matching" selects exactly the notes the list is showing."""
    conditions: list = [
        col(Note.deleted_at).is_not(None) if deleted else col(Note.deleted_at).is_(None)
    ]

    if search:
        term = f"%{search.strip()}%"
        conditions.append(or_(col(Note.name).ilike(term), col(Note.content).ilike(term)))

    if start is not None and end is not None:
        start_utc = to_utc(start).replace(tzinfo=None)
        end_utc = to_utc(end).replace(tzinfo=None)

        in_range = and_(col(Reminder.remind_at) >= start_utc, col(Reminder.remind_at) < end_utc)
        if start_utc <= utcnow().replace(tzinfo=None) < end_utc:
            # This window covers "now", i.e. it's today -- the calendar and
            # the due-today count both roll every overdue pending reminder
            # onto today regardless of how many days overdue it is, so match
            # that here too, or clicking today's cell shows fewer notes than
            # it counted.
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
    sort: NoteSort = "due",
    order: Literal["asc", "desc"] = "asc",
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
):
    conditions = _list_conditions(
        start=start, end=end, tag_id=tag_id, project_id=project_id, deleted=deleted, search=search
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
    sort: NoteSort = "due",
    order: Literal["asc", "desc"] = "asc",
):
    """Just the ids of every note /list would return for the same filters (in
    the same order), for "select all N matching" -- the list is paged, so the
    client can't know the ids it hasn't loaded. Capped at MAX_BULK_IDS: `ids`
    is shorter than `total` when there are more than that."""
    conditions = _list_conditions(
        start=start, end=end, tag_id=tag_id, project_id=project_id, deleted=deleted, search=search
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
    """Notes whose pending reminder is due now, oldest-due first. Paged: after
    a bulk import thousands can be due at once, and the review flow only ever
    needs the next few."""
    conditions: list = [
        col(Note.deleted_at).is_(None),
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


@router.post("/create", response_model=NoteResponse)
def create_note(body: NewNoteBody, session: SessionDep):
    tags: list[Tag] = []
    if body.tag_ids:
        tags = list(session.exec(select(Tag).where(col(Tag.id).in_(body.tag_ids))).all())
    # difficulty is sticky and applied separately, never via arbitrary tag_ids
    tags = [tag for tag in tags if not tag.is_difficulty]

    note = build_note(
        name=body.name,
        content=body.content,
        algorithm=get_default_algorithm(session),
        difficulty_tag=get_difficulty_tag(session, body.difficulty),
        tags=tags,
        project=get_project(session, body.project_id) if body.project_id is not None else None,
        first_reminder_at=to_utc(body.first_reminder_at),
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
    """Permanently deletes every note currently in the trash. Registered
    before DELETE /{note_id} below so "trash" isn't swallowed as a note_id."""
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


class RescheduleReminderBody(BaseModel):
    remind_at: datetime.datetime


@router.patch("/{note_id}/reminders/pending", response_model=NoteResponse)
def reschedule_pending_reminder(note_id: int, body: RescheduleReminderBody, session: SessionDep):
    """Move a note's upcoming reminder to an arbitrary date — e.g. "review this
    today" even though it isn't naturally due yet. Every not-deleted note has
    exactly one pending (unreviewed) reminder at all times, so this just moves
    it rather than adding a second one; SM-2 state (ease/interval) is untouched,
    only the schedule."""
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

    # undo_review
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
