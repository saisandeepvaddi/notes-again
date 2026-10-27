from typing import Any, cast

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, text
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from db.models import Note, NoteTag, Project, Tag
from db.setup import SessionDep
from notes.bulk import ReviewStatus
from notes.title_text import markdown_title_text

from .query import (
    MAX_QUERY_LENGTH,
    SearchTerms,
    like_pattern,
    mark,
    match_expression,
    parse_terms,
    snippet,
)
from .schema import NamedHit, NoteHit, SearchResults

router = APIRouter(prefix="/search", tags=["search"])

NAMED_LIMIT = 5


def _status(note: Note) -> ReviewStatus:
    if not note.in_review:
        return "note-only"
    return "paused" if note.paused_at is not None else "active"


_RANKED_IDS = """
WITH ranked AS MATERIALIZED (
  SELECT rowid AS id, bm25(notes_fts, 8.0, 1.0) AS score
  FROM notes_fts WHERE notes_fts MATCH :match
)
SELECT notes.id FROM ranked JOIN notes ON notes.id = ranked.id
WHERE notes.deleted_at IS NULL {short}
ORDER BY ranked.score, notes.updated_at DESC
LIMIT :limit
"""

_SHORT_TERM = (
    "AND (notes.name LIKE :short{i} ESCAPE '\\' "
    "OR notes.content LIKE :short{i} ESCAPE '\\')"
)


def _ranked_note_ids(session: Session, terms: SearchTerms, limit: int) -> list[int]:
    if terms.indexed:
        short = " ".join(_SHORT_TERM.format(i=i) for i in range(len(terms.short)))
        params: dict[str, object] = {
            "match": match_expression(terms.indexed),
            "limit": limit,
        }
        params |= {f"short{i}": like_pattern(t) for i, t in enumerate(terms.short)}
        rows = session.connection().execute(
            text(_RANKED_IDS.format(short=short)), params
        )
        return [row[0] for row in rows]
    return list(
        session.exec(
            select(Note.id)
            .where(
                col(Note.deleted_at).is_(None),
                *(
                    col(Note.name).ilike(like_pattern(term), escape="\\")
                    for term in terms.short
                ),
            )
            .order_by(col(Note.updated_at).desc())
            .limit(limit)
        ).all()
    )


def _find_notes(session: Session, terms: SearchTerms, limit: int) -> list[Note]:
    ids = _ranked_note_ids(session, terms, limit)
    if not ids:
        return []
    notes = session.exec(
        select(Note)
        .where(col(Note.id).in_(ids))
        .options(selectinload(cast(Any, Note.project)))
    ).all()
    by_id = {note.id: note for note in notes}
    return [by_id[note_id] for note_id in ids if note_id in by_id]


def _name_condition(name_column, terms: SearchTerms):
    return and_(*(func.lower(name_column).contains(term.lower()) for term in terms.all))


def _find_projects(session: Session, terms: SearchTerms) -> list[NamedHit]:
    counts = (
        select(Note.project_id, func.count().label("total"))
        .where(col(Note.deleted_at).is_(None))
        .group_by(col(Note.project_id))
        .subquery()
    )
    rows = session.exec(
        select(Project, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.project_id == col(Project.id))
        .where(col(Project.deleted_at).is_(None), _name_condition(Project.name, terms))
        .order_by(func.length(Project.name), func.lower(Project.name))
        .limit(NAMED_LIMIT)
    ).all()
    return [
        NamedHit(
            id=project.id,
            name=project.name,
            name_marked=mark(project.name, terms.all),
            note_count=total,
        )
        for project, total in rows
    ]


def _find_tags(session: Session, terms: SearchTerms) -> list[NamedHit]:
    counts = (
        select(NoteTag.tag_id, func.count().label("total"))
        .join(Note, col(Note.id) == col(NoteTag.note_id))
        .where(col(Note.deleted_at).is_(None))
        .group_by(col(NoteTag.tag_id))
        .subquery()
    )
    rows = session.exec(
        select(Tag, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.tag_id == col(Tag.id))
        .where(_name_condition(Tag.name, terms))
        .order_by(func.length(Tag.name), func.lower(Tag.name))
        .limit(NAMED_LIMIT)
    ).all()
    return [
        NamedHit(
            id=tag.id,
            name=tag.name,
            name_marked=mark(tag.name, terms.all),
            note_count=total,
        )
        for tag, total in rows
    ]


@router.get("", response_model=SearchResults)
def search(
    session: SessionDep,
    q: str = Query("", max_length=MAX_QUERY_LENGTH * 2),
    limit: int = Query(20, ge=1, le=50),
):
    terms = parse_terms(q)
    if not terms.all:
        return SearchResults(notes=[], projects=[], tags=[])
    notes = [
        NoteHit(
            id=note.id,
            title=(title := markdown_title_text(note.name) or ""),
            title_marked=mark(title, terms.all),
            snippet=snippet(note.content, terms.all),
            project=note.project,
            status=_status(note),
            updated_at=note.updated_at,
        )
        for note in _find_notes(session, terms, limit)
    ]
    return SearchResults(
        notes=notes,
        projects=_find_projects(session, terms),
        tags=_find_tags(session, terms),
    )
