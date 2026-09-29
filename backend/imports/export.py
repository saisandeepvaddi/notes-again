from typing import Any, cast

from sqlalchemy import func, or_
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from db.models import Note, NoteTag, Project, utcnow
from notes.utils import to_utc_iso
from tags.difficulty import DIFFICULTY_TAGS

from .review_state import export_review
from .schema import ExportCount, ExportRequest

EXPORT_FORMAT = "note-and-learn"
EXPORT_VERSION = 1

_DIFFICULTY_BY_TAG = {
    defaults.name.lower(): key for key, defaults in DIFFICULTY_TAGS.items()
}


def _conditions(options: ExportRequest) -> list:
    conditions: list = [col(Note.deleted_at).is_(None)]
    if options.project_ids or options.include_no_project:
        in_scope = []
        if options.project_ids:
            in_scope.append(col(Note.project_id).in_(options.project_ids))
        if options.include_no_project:
            in_scope.append(col(Note.project_id).is_(None))
        conditions.append(or_(*in_scope))
    if options.tag_ids:
        conditions.append(
            col(Note.id).in_(
                select(NoteTag.note_id).where(col(NoteTag.tag_id).in_(options.tag_ids))
            )
        )
    if options.note_ids is not None:
        conditions.append(col(Note.id).in_(options.note_ids))
    if not options.include_paused:
        conditions.append(col(Note.paused_at).is_(None))
    return conditions


def count_export(session: Session, options: ExportRequest) -> ExportCount:
    conditions = _conditions(options)
    notes = session.exec(
        select(func.count()).select_from(Note).where(*conditions)
    ).one()
    decks = session.exec(
        select(func.count(func.distinct(Note.project_id)))
        .join(Project, col(Project.id) == col(Note.project_id))
        .where(*conditions, col(Project.deleted_at).is_(None))
    ).one()
    return ExportCount(notes=notes, decks=decks)


def _export_note(note: Note, include_review: bool) -> dict:
    difficulty = next(
        (
            _DIFFICULTY_BY_TAG[t.name.lower()]
            for t in note.tags
            if t.is_difficulty and t.name.lower() in _DIFFICULTY_BY_TAG
        ),
        "medium",
    )
    exported = {
        "name": note.name,
        "content": note.content,
        "tags": sorted(
            (t.name for t in note.tags if not t.is_difficulty), key=str.lower
        ),
        "difficulty": difficulty,
        "created_at": to_utc_iso(note.created_at),
        "updated_at": to_utc_iso(note.updated_at),
    }
    if include_review:
        exported["review"] = export_review(note)
    return exported


def build_export(session: Session, options: ExportRequest) -> dict:
    notes = session.exec(
        select(Note)
        .where(*_conditions(options))
        .order_by(col(Note.created_at), col(Note.id))
        .options(
            selectinload(cast(Any, Note.reminders)),
            selectinload(cast(Any, Note.tags)),
        )
    ).all()
    projects = session.exec(
        select(Project)
        .where(col(Project.deleted_at).is_(None))
        .order_by(col(Project.id))
    ).all()

    by_project: dict[int, list[dict]] = {project.id: [] for project in projects}
    loose: list[dict] = []
    for note in notes:
        exported = _export_note(note, options.include_review)
        if note.project_id in by_project:
            by_project[note.project_id].append(exported)
        else:
            loose.append(exported)

    return {
        "format": EXPORT_FORMAT,
        "version": EXPORT_VERSION,
        "exported_at": to_utc_iso(utcnow()),
        "decks": [
            {
                "name": project.name,
                **({"paused": project.paused} if options.include_review else {}),
                "notes": by_project[project.id],
            }
            for project in projects
            if by_project[project.id]
        ],
        "notes": loose,
    }
