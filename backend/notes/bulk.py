import datetime
from collections.abc import Iterator
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import delete, update
from sqlalchemy.sql.elements import ColumnElement
from sqlmodel import Session, col, select

from db.models import Note, Reminder, utcnow
from notes.pacing import MAX_PER_DAY, Pacer
from notes.scheduling import snapshot_for_new_reminder

ReviewStatus = Literal["active", "paused", "note-only"]


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
        .where(
            col(Note.deleted_at).is_(None),
            col(Note.in_review).is_(True),
            col(Note.paused_at).is_(None),
            *conditions,
        )
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
    ids = _matching_ids(
        session,
        [col(Note.deleted_at).is_(None), col(Note.paused_at).is_not(None), *conditions],
        note_ids,
    )
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


def remove_from_review(
    session: Session, *conditions: ColumnElement[bool], note_ids: list[int] | None = None
) -> int:
    ids = _matching_ids(
        session,
        [col(Note.deleted_at).is_(None), col(Note.in_review).is_(True), *conditions],
        note_ids,
    )
    for chunk in chunked(ids):
        session.exec(  # type: ignore[call-overload]
            delete(Reminder).where(
                col(Reminder.note_id).in_(chunk), col(Reminder.reviewed_at).is_(None)
            )
        )
        session.exec(  # type: ignore[call-overload]
            update(Note).where(col(Note.id).in_(chunk)).values(in_review=False, paused_at=None)
        )
    return len(ids)


def add_to_review(
    session: Session,
    *conditions: ColumnElement[bool],
    note_ids: list[int] | None = None,
    paused: bool = False,
    per_day: int = 0,
    tz_offset_minutes: int = 0,
) -> ResumeResult:
    ids = _matching_ids(
        session,
        [col(Note.deleted_at).is_(None), col(Note.in_review).is_(False), *conditions],
        note_ids,
    )
    if not ids:
        return ResumeResult(affected=0)

    pacer = Pacer(tz_offset_minutes)
    day_by_id = {
        note_id: pacer.day(position, 0 if paused else per_day)
        for position, note_id in enumerate(ids)
    }
    paused_at = utcnow() if paused else None
    for chunk in chunked(ids):
        notes = session.exec(select(Note).where(col(Note.id).in_(chunk))).all()
        for note in sorted(notes, key=lambda note: day_by_id[note.id]):
            session.add(
                Reminder(
                    note_id=note.id,
                    remind_at=pacer.due_at(day_by_id[note.id]),
                    **snapshot_for_new_reminder(note),
                )
            )
            note.in_review = True
            note.paused_at = paused_at
            session.add(note)
    session.flush()
    days = [] if paused else list(day_by_id.values())
    return ResumeResult(
        affected=len(ids),
        due_today=sum(1 for day in days if day == 0),
        days_span=max(days, default=-1) + 1,
    )


def _matching_ids(
    session: Session, conditions: list, note_ids: list[int] | None
) -> list[int]:
    if note_ids is None:
        statement = select(Note.id).where(*conditions).order_by(col(Note.id))
        return list(session.exec(statement).all())
    found: set[int] = set()
    for chunk in chunked(note_ids):
        in_chunk = select(Note.id).where(*conditions, col(Note.id).in_(chunk))
        found.update(session.exec(in_chunk).all())
    return [note_id for note_id in note_ids if note_id in found]


def _utc(value: datetime.datetime) -> datetime.datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=datetime.UTC)
