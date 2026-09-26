import datetime
from collections.abc import Iterator

from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import Session, col, select

from db.models import Note, Reminder, utcnow
from notes.pacing import MAX_PER_DAY, Pacer


class GroupDeleteResult(BaseModel):
    """What deleting a project or tag did to the notes that belonged to it."""

    # live notes moved to the trash (only when asked to delete them too)
    notes_trashed: int
    # live notes that were kept
    notes_kept: int
    # tags removed because deleting the notes left them with none
    tags_deleted: int = 0


def trash_notes(session: Session, *conditions: ColumnElement[bool]) -> int:
    """Moves every live note matching `conditions` to the trash (soft delete,
    same as DELETE /notes/{id}) in one UPDATE, so a group of thousands is one
    statement rather than thousands of ORM round trips. Doesn't commit."""
    result = session.exec(  # type: ignore[call-overload]
        update(Note)
        .where(col(Note.deleted_at).is_(None), *conditions)
        .values(deleted_at=utcnow())
    )
    return result.rowcount


# One bulk request's ceiling. Also the most "select all matching" will ever
# grab, so the UI can say so instead of silently acting on a partial set.
MAX_BULK_IDS = 10_000
# SQLite's bound-parameter limit is per statement, so big id sets go in chunks.
_CHUNK = 900


def chunked(ids: list[int]) -> Iterator[list[int]]:
    for i in range(0, len(ids), _CHUNK):
        yield ids[i : i + _CHUNK]


def pause_notes(session: Session, *conditions: ColumnElement[bool]) -> int:
    """Pauses every live, active note matching `conditions` in one UPDATE.
    Reminders and scheduling state are left alone. Doesn't commit."""
    result = session.exec(  # type: ignore[call-overload]
        update(Note)
        .where(col(Note.deleted_at).is_(None), col(Note.paused_at).is_(None), *conditions)
        .values(paused_at=utcnow())
    )
    return result.rowcount


class ResumeOptions(BaseModel):
    # never-reviewed notes that are already due come back this many a day
    # (0 = all now); see resume_notes
    per_day: int = Field(10, ge=0, le=MAX_PER_DAY)
    tz_offset_minutes: int = Field(0, ge=-24 * 60, le=24 * 60)


class ResumeResult(BaseModel):
    affected: int
    # how many of the resumed notes are due now, and how many days the
    # re-paced never-reviewed ones were spread over (0 = none were)
    due_today: int = 0
    days_span: int = 0


def resume_notes(
    session: Session,
    *conditions: ColumnElement[bool],
    note_ids: list[int] | None = None,
    per_day: int = 0,
    tz_offset_minutes: int = 0,
) -> ResumeResult:
    """Resumes every live, paused note matching `conditions` (and, if given,
    in `note_ids`). Doesn't commit.

    Notes that were never reviewed and are already due (e.g. a whole deck
    imported paused) are re-paced `per_day` at a time from today, in the order
    they were due, so resuming thousands doesn't dump them all into today's
    review. Notes with review history keep their schedule: they come back
    overdue, which the scheduler already handles. per_day 0 = no re-pacing.
    """
    paused = [col(Note.deleted_at).is_(None), col(Note.paused_at).is_not(None), *conditions]
    ids: list[int] = []
    # one pass over all ids (not a call per chunk), so pacing spans the whole set
    for chunk in chunked(note_ids) if note_ids is not None else [None]:
        in_chunk = [col(Note.id).in_(chunk)] if chunk is not None else []
        ids += session.exec(select(Note.id).where(*paused, *in_chunk)).all()
    if not ids:
        return ResumeResult(affected=0)

    now = utcnow()
    # (remind_at, note id, reminder id) of each resumed note's pending review
    pending: list[tuple[datetime.datetime, int, int]] = []
    reviewed: set[int] = set()
    for chunk in chunked(ids):
        pending += session.exec(  # type: ignore[arg-type]
            select(Reminder.remind_at, Reminder.note_id, Reminder.id).where(
                col(Reminder.note_id).in_(chunk),
                col(Reminder.deleted_at).is_(None),
                col(Reminder.reviewed_at).is_(None),
            )
        ).all()
        reviewed.update(
            session.exec(  # type: ignore[arg-type]
                select(Reminder.note_id).where(
                    col(Reminder.note_id).in_(chunk), col(Reminder.reviewed_at).is_not(None)
                )
            ).all()
        )
    due = sorted(row for row in pending if _utc(row[0]) <= now)
    due_new = [row for row in due if row[1] not in reviewed] if per_day > 0 else []

    pacer = Pacer(tz_offset_minutes)
    days = [pacer.day(position, per_day) for position in range(len(due_new))]
    if due_new:
        session.execute(
            update(Reminder),
            [
                {"id": reminder_id, "remind_at": pacer.due_at(day)}
                for (_, _, reminder_id), day in zip(due_new, days, strict=True)
            ],
        )

    for chunk in chunked(ids):
        session.exec(  # type: ignore[call-overload]
            update(Note).where(col(Note.id).in_(chunk)).values(paused_at=None)
        )
    return ResumeResult(
        affected=len(ids),
        due_today=len(due) - sum(1 for day in days if day > 0),
        days_span=max(days, default=-1) + 1,
    )


def _utc(value: datetime.datetime) -> datetime.datetime:
    # SQLite hands datetimes back naive; they're stored as UTC
    return value if value.tzinfo is not None else value.replace(tzinfo=datetime.UTC)
