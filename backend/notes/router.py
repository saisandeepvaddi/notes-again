import datetime
from typing import Any, Literal, cast

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from db.models import Note, NoteTag, Reminder, Tag, utcnow
from db.setup import SessionDep
from notes.srs import compute_next_interval
from notes.utils import to_utc
from tags.difficulty import DIFFICULTY_TAGS, Difficulty

from .schema import NoteResponse

router = APIRouter(prefix="/notes", tags=["notes"])


def get_difficulty_tag(session: Session, difficulty: Difficulty) -> Tag:
    name = DIFFICULTY_TAGS[difficulty].name
    tag = session.exec(select(Tag).where(Tag.name == name)).one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Difficulty tag missing")
    return tag


def get_difficulty_tag_by_ease_factor(session: Session, ease_factor: float) -> Tag | None:
    return session.exec(
        select(Tag).where(col(Tag.is_difficulty).is_(True), Tag.default_ease_factor == ease_factor)
    ).one_or_none()


def apply_difficulty(session: Session, note: Note, difficulty: Difficulty) -> Tag:
    """Sets a note's difficulty tag (swapping out any existing one) and syncs
    its ease factor to match. This is the only lever on review pacing now —
    there's no separate per-review rating scale."""
    tag = get_difficulty_tag(session, difficulty)
    note.tags = [t for t in note.tags if not t.is_difficulty] + [tag]
    note.ease_factor = tag.default_ease_factor or note.ease_factor
    return tag


def get_project_tag(session: Session, project_id: int) -> Tag:
    tag = session.exec(
        select(Tag).where(Tag.id == project_id, col(Tag.is_project).is_(True))
    ).one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return tag


def apply_project(note: Note, project_tag: Tag | None) -> None:
    """Sets a note's project (swapping out any existing one, like difficulty).
    A note holds at most one project; pass None to unassign."""
    note.tags = [t for t in note.tags if not t.is_project] + ([project_tag] if project_tag else [])


@router.get("/list", response_model=list[NoteResponse])
def get_notes(
    session: SessionDep,
    start: datetime.datetime | None = None,
    end: datetime.datetime | None = None,
    tag_id: int | None = None,
    project_id: int | None = None,
    deleted: bool = False,
):
    deleted_filter = (
        col(Note.deleted_at).is_not(None) if deleted else col(Note.deleted_at).is_(None)
    )

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

        statement = (
            select(Reminder)
            .join(Note, col(Reminder.note_id) == col(Note.id))
            .where(
                remind_at_filter,
                deleted_filter,
                col(Reminder.deleted_at).is_(None),
            )
        )
        if tag_id is not None:
            statement = statement.join(
                NoteTag, col(NoteTag.note_id) == col(Note.id)
            ).where(col(NoteTag.tag_id) == tag_id)
        if project_id is not None:
            statement = statement.where(
                col(Note.id).in_(select(NoteTag.note_id).where(NoteTag.tag_id == project_id))
            )
        reminders = session.exec(statement).all()
        seen = set()
        notes: list[Note] = []
        for reminder in reminders:
            if reminder.note is not None and reminder.note.id not in seen:
                notes.append(reminder.note)
                seen.add(reminder.note.id)
        return notes

    statement = (
        select(Note)
        .where(deleted_filter)
        .options(
            selectinload(cast(Any, Note.reminders)),
            selectinload(cast(Any, Note.tags)),
        )
    )
    if tag_id is not None:
        statement = statement.join(NoteTag, col(NoteTag.note_id) == col(Note.id)).where(
            col(NoteTag.tag_id) == tag_id
        )
    if project_id is not None:
        statement = statement.where(
            col(Note.id).in_(select(NoteTag.note_id).where(NoteTag.tag_id == project_id))
        )
    notes = list(session.exec(statement=statement).all())
    return notes


@router.get("/due", response_model=list[NoteResponse])
def get_due_notes(session: SessionDep):
    # Joined via Reminder (not a plain Note select) and deduped below: notes
    # created under the old fixed-schedule model can still have more than one
    # pending reminder due at once until they've gone through one review.
    statement = (
        select(Reminder)
        .join(Note, col(Reminder.note_id) == col(Note.id))
        .where(
            col(Note.deleted_at).is_(None),
            col(Reminder.deleted_at).is_(None),
            col(Reminder.reviewed_at).is_(None),
            col(Reminder.remind_at) <= utcnow(),
        )
        .order_by(col(Reminder.remind_at).asc())
    )
    reminders = session.exec(statement).all()
    seen: set[int] = set()
    notes: list[Note] = []
    for reminder in reminders:
        if reminder.note is not None and reminder.note.id not in seen:
            notes.append(reminder.note)
            seen.add(cast(int, reminder.note.id))
    return notes


class CalendarDay(BaseModel):
    date: str
    due: int = 0
    overdue: int = 0
    reviewed: int = 0


@router.get("/calendar", response_model=dict[str, CalendarDay])
def get_notes_calendar(
    session: SessionDep,
    start: datetime.datetime,
    end: datetime.datetime,
    tz_offset_minutes: int = 0,
):
    """Per-day counts for a calendar view.

    `due` only covers today-or-later (a pending reminder scheduled in the
    past is, by definition, overdue). All currently-overdue reminders are
    rolled onto today's entry instead of showing on their stale original
    date, since today is the only day they're actually actionable from.

    Everything is stored as naive UTC, but "day" is a calendar concept the
    client's local timezone defines, not UTC's. `tz_offset_minutes` is the
    browser's `Date.getTimezoneOffset()` (minutes to ADD to local time to
    get UTC); grouping shifts each UTC timestamp back by that amount before
    taking its date, so a note due at 11pm local doesn't get bucketed onto
    tomorrow just because it's already tomorrow in UTC.
    """
    start_utc = to_utc(start).replace(tzinfo=None)
    end_utc = to_utc(end).replace(tzinfo=None)
    local_date = func.date(Reminder.remind_at, f"{-tz_offset_minutes} minutes")
    local_reviewed_date = func.date(Reminder.reviewed_at, f"{-tz_offset_minutes} minutes")

    local_now = utcnow().replace(tzinfo=None) - datetime.timedelta(minutes=tz_offset_minutes)
    local_midnight = datetime.datetime.combine(local_now.date(), datetime.time.min)
    today_start = local_midnight + datetime.timedelta(minutes=tz_offset_minutes)

    days: dict[str, CalendarDay] = {}

    def day(date_str: str) -> CalendarDay:
        return days.setdefault(date_str, CalendarDay(date=date_str))

    due_rows = session.exec(
        select(local_date, func.count())
        .join(Note, col(Reminder.note_id) == col(Note.id))
        .where(
            col(Note.deleted_at).is_(None),
            col(Reminder.deleted_at).is_(None),
            col(Reminder.reviewed_at).is_(None),
            col(Reminder.remind_at) >= start_utc,
            col(Reminder.remind_at) < end_utc,
            col(Reminder.remind_at) >= today_start,
        )
        .group_by(local_date)
    ).all()
    for date_str, count in due_rows:
        day(date_str).due = count

    reviewed_rows = session.exec(
        select(local_reviewed_date, func.count())
        .join(Note, col(Reminder.note_id) == col(Note.id))
        .where(
            col(Note.deleted_at).is_(None),
            col(Reminder.deleted_at).is_(None),
            col(Reminder.reviewed_at).is_not(None),
            col(Reminder.reviewed_at) >= start_utc,
            col(Reminder.reviewed_at) < end_utc,
        )
        .group_by(local_reviewed_date)
    ).all()
    for date_str, count in reviewed_rows:
        day(date_str).reviewed = count

    today_str = local_now.date().isoformat()
    if start_utc <= today_start < end_utc:
        overdue_count = session.exec(
            select(func.count())
            .select_from(Reminder)
            .join(Note, col(Reminder.note_id) == col(Note.id))
            .where(
                col(Note.deleted_at).is_(None),
                col(Reminder.deleted_at).is_(None),
                col(Reminder.reviewed_at).is_(None),
                col(Reminder.remind_at) < today_start,
            )
        ).one()
        if overdue_count:
            day(today_str).overdue = overdue_count

    return days


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
    # difficulty and project are sticky and applied separately, never via arbitrary tag_ids
    tags = [tag for tag in tags if not tag.is_difficulty and not tag.is_project]

    note = Note(name=body.name, content=body.content, tags=tags, user_id=1)
    apply_difficulty(session, note, body.difficulty)
    if body.project_id is not None:
        apply_project(note, get_project_tag(session, body.project_id))
    note.reminders = [
        Reminder(
            remind_at=to_utc(body.first_reminder_at),
            ease_factor=note.ease_factor,
            interval_days=0,
        )
    ]
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

    project_tag = get_project_tag(session, body.project_id) if body.project_id is not None else None
    apply_project(note, project_tag)
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
    rating: Difficulty | None = None


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
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "difficulty is required to review")

        apply_difficulty(session, note, body.rating)
        new_interval = compute_next_interval(note.interval_days, note.ease_factor)

        reminder.reviewed_at = utcnow()
        reminder.rating = body.rating
        note.interval_days = new_interval
        next_reminder = Reminder(
            note_id=note.id,
            remind_at=utcnow() + datetime.timedelta(days=new_interval),
            ease_factor=note.ease_factor,
            interval_days=new_interval,
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

    if reminder.ease_factor is not None:
        note.ease_factor = reminder.ease_factor
        restored_tag = get_difficulty_tag_by_ease_factor(session, reminder.ease_factor)
        if restored_tag is not None:
            note.tags = [tag for tag in note.tags if not tag.is_difficulty] + [restored_tag]
    if reminder.interval_days is not None:
        note.interval_days = reminder.interval_days
    reminder.reviewed_at = None
    reminder.rating = None
    session.add_all([reminder, note])
    session.commit()
    session.refresh(note)
    return note
