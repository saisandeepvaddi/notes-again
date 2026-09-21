import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, update
from sqlmodel import Session, col, select

from db.models import Note, NoteTag, Reminder, Tag
from db.setup import SessionDep
from notes.bulk import MAX_BULK_IDS, chunked, trash_notes
from notes.router import get_difficulty_tag, get_project
from notes.utils import to_utc
from tags.difficulty import Difficulty

# Bulk versions of the single-note edits in router.py: the same rules, applied
# to a whole selection in a handful of statements instead of one request (and
# one round trip) per note. Each returns how many notes it actually touched;
# ids that don't match (already trashed, since deleted, ...) are skipped rather
# than failing the whole batch.
router = APIRouter(prefix="/notes/bulk", tags=["notes"])


class BulkResult(BaseModel):
    affected: int


class BulkBody(BaseModel):
    note_ids: list[int]


def _ids(body: BulkBody) -> list[int]:
    # Plain-string 400 (not a pydantic 422) so the UI can show it as-is.
    if len(body.note_ids) > MAX_BULK_IDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Too many notes at once (max {MAX_BULK_IDS:,}).",
        )
    return list(dict.fromkeys(body.note_ids))


def _live_ids(session: Session, chunk: list[int]) -> list[int]:
    return list(
        session.exec(
            select(Note.id).where(col(Note.id).in_(chunk), col(Note.deleted_at).is_(None))
        ).all()
    )


@router.post("/delete", response_model=BulkResult)
def bulk_trash(body: BulkBody, session: SessionDep):
    """Moves the notes to the trash (same soft delete as DELETE /notes/{id})."""
    affected = sum(
        trash_notes(session, col(Note.id).in_(chunk)) for chunk in chunked(_ids(body))
    )
    session.commit()
    return BulkResult(affected=affected)


@router.post("/restore", response_model=BulkResult)
def bulk_restore(body: BulkBody, session: SessionDep):
    affected = 0
    for chunk in chunked(_ids(body)):
        result = session.exec(  # type: ignore[call-overload]
            update(Note)
            .where(col(Note.id).in_(chunk), col(Note.deleted_at).is_not(None))
            .values(deleted_at=None)
        )
        affected += result.rowcount
    session.commit()
    return BulkResult(affected=affected)


@router.post("/permanent", response_model=BulkResult)
def bulk_permanently_delete(body: BulkBody, session: SessionDep):
    """Permanently deletes notes -- only ones already in the trash, so a stale
    selection can never destroy a live note."""
    affected = 0
    for chunk in chunked(_ids(body)):
        # ORM delete (not a bulk DELETE) so reminders cascade and note_tags
        # rows go with them, exactly like DELETE /notes/{id}/permanent.
        notes = session.exec(
            select(Note).where(col(Note.id).in_(chunk), col(Note.deleted_at).is_not(None))
        ).all()
        for note in notes:
            session.delete(note)
        affected += len(notes)
    session.commit()
    return BulkResult(affected=affected)


class BulkProjectBody(BulkBody):
    project_id: int | None = None


@router.post("/project", response_model=BulkResult)
def bulk_set_project(body: BulkProjectBody, session: SessionDep):
    """Moves the notes into a project (or, with project_id null, out of any)."""
    if body.project_id is not None:
        get_project(session, body.project_id)  # 404s if it doesn't exist
    affected = 0
    for chunk in chunked(_ids(body)):
        result = session.exec(  # type: ignore[call-overload]
            update(Note)
            .where(col(Note.id).in_(chunk), col(Note.deleted_at).is_(None))
            .values(project_id=body.project_id)
        )
        affected += result.rowcount
    session.commit()
    return BulkResult(affected=affected)


class BulkTagsBody(BulkBody):
    add_tag_ids: list[int] = []
    remove_tag_ids: list[int] = []


@router.post("/tags", response_model=BulkResult)
def bulk_edit_tags(body: BulkTagsBody, session: SessionDep):
    """Adds and/or removes (regular, not difficulty) tags on the notes."""
    wanted = set(body.add_tag_ids) | set(body.remove_tag_ids)
    tags = session.exec(select(Tag).where(col(Tag.id).in_(wanted))).all() if wanted else []
    if len(tags) != len(wanted):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    if any(tag.is_difficulty for tag in tags):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Use the difficulty action to change difficulty"
        )

    affected = 0
    for chunk in chunked(_ids(body)):
        live = _live_ids(session, chunk)
        affected += len(live)
        if not live:
            continue
        if body.remove_tag_ids:
            session.exec(  # type: ignore[call-overload]
                delete(NoteTag).where(
                    col(NoteTag.note_id).in_(live), col(NoteTag.tag_id).in_(body.remove_tag_ids)
                )
            )
        if body.add_tag_ids:
            have = set(
                session.exec(
                    select(NoteTag.note_id, NoteTag.tag_id).where(
                        col(NoteTag.note_id).in_(live), col(NoteTag.tag_id).in_(body.add_tag_ids)
                    )
                ).all()
            )
            session.add_all(
                NoteTag(note_id=note_id, tag_id=tag_id)
                for note_id in live
                for tag_id in dict.fromkeys(body.add_tag_ids)
                if (note_id, tag_id) not in have
            )
    session.commit()
    return BulkResult(affected=affected)


class BulkDifficultyBody(BulkBody):
    difficulty: Difficulty


@router.post("/difficulty", response_model=BulkResult)
def bulk_set_difficulty(body: BulkDifficultyBody, session: SessionDep):
    """Sets the notes' difficulty tag (replacing any existing one) and syncs
    their ease factor to it -- same as PATCH /notes/{id}/difficulty."""
    tag = get_difficulty_tag(session, body.difficulty)
    difficulty_tag_ids = list(
        session.exec(select(Tag.id).where(col(Tag.is_difficulty).is_(True))).all()
    )
    affected = 0
    for chunk in chunked(_ids(body)):
        live = _live_ids(session, chunk)
        affected += len(live)
        if not live:
            continue
        session.exec(  # type: ignore[call-overload]
            delete(NoteTag).where(
                col(NoteTag.note_id).in_(live), col(NoteTag.tag_id).in_(difficulty_tag_ids)
            )
        )
        session.add_all(NoteTag(note_id=note_id, tag_id=tag.id) for note_id in live)
        if tag.default_ease_factor is not None:
            session.exec(  # type: ignore[call-overload]
                update(Note)
                .where(col(Note.id).in_(live))
                .values(ease_factor=tag.default_ease_factor)
            )
    session.commit()
    return BulkResult(affected=affected)


class BulkRescheduleBody(BulkBody):
    remind_at: datetime.datetime


@router.post("/reschedule", response_model=BulkResult)
def bulk_reschedule(body: BulkRescheduleBody, session: SessionDep):
    """Moves each note's upcoming review to `remind_at` (see
    PATCH /notes/{id}/reminders/pending). Scheduling state is untouched."""
    remind_at = to_utc(body.remind_at)
    affected = 0
    for chunk in chunked(_ids(body)):
        live = _live_ids(session, chunk)
        if not live:
            continue
        result = session.exec(  # type: ignore[call-overload]
            update(Reminder)
            .where(
                col(Reminder.note_id).in_(live),
                col(Reminder.deleted_at).is_(None),
                col(Reminder.reviewed_at).is_(None),
            )
            .values(remind_at=remind_at)
        )
        affected += result.rowcount
    session.commit()
    return BulkResult(affected=affected)
