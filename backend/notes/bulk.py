import datetime
from collections.abc import Iterator

from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import Session, col, select

from db.models import Note, Reminder, utcnow
from notes.pacing import MAX_PER_DAY, Pacer


class GroupDeleteResult(BaseModel):
    notes_trashed: int
    notes_kept: int
    tags_deleted: int = 0


def trash_notes(session: Session, *conditions: ColumnElement[bool]) -> int:
    result = session.exec(  # type: ignore[call-overload]
        update(Note)
        .where(col(Note.deleted_at).is_(None), *conditions)
        .values(deleted_at=utcnow())
    )
    return result.rowcount


MAX_BULK_IDS = 10_000
_CHUNK = 900


def chunked(ids: list[int]) -> Iterator[list[int]]:
    for i in range(0, len(ids), _CHUNK):
        yield ids[i : i + _CHUNK]


def pause_notes(session: Session, *conditions: ColumnElement[bool]) -> int:
    result = session.exec(  # type: ignore[call-overload]
        update(Note)
        .where(col(Note.deleted_at).is_(None), col(Note.paused_at).is_(None), *conditions)
        .values(paused_at=utcnow())
    )
    return result.rowcount


class ResumeOptions(BaseModel):
    per_day: int = Field(10, ge=0, le=MAX_PER_DAY)
    tz_offset_minutes: int = Field(0, ge=-24 * 60, le=24 * 60)


class ResumeResult(BaseModel):
    affected: int
    due_today: int = 0
    days_span: int = 0


def resume_notes(
    session: Session,
    *conditions: ColumnElement[bool],
    note_ids: list[int] | None = None,
    per_day: int = 0,
    tz_offset_minutes: int = 0,
) -> ResumeResult:
    paused = [col(Note.deleted_at).is_(None), col(Note.paused_at).is_not(None), *conditions]
    ids: list[int] = []
    for chunk in chunked(note_ids) if note_ids is not None else [None]:
        in_chunk = [col(Note.id).in_(chunk)] if chunk is not None else []
        ids += session.exec(select(Note.id).where(*paused, *in_chunk)).all()
    if not ids:
        return ResumeResult(affected=0)

    now = utcnow()
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
    return value if value.tzinfo is not None else value.replace(tzinfo=datetime.UTC)
