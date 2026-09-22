from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, update
from sqlmodel import col, func, select

from db.models import Note, NoteTag, Project
from db.setup import SessionDep
from notes.bulk import GroupDeleteResult, trash_notes
from tags.unused import delete_unused_tags

from .schema import ProjectListItem, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/list", response_model=list[ProjectListItem])
def get_projects(session: SessionDep):
    statement = (
        select(Project)
        .where(col(Project.deleted_at).is_(None))
        .order_by(func.lower(Project.name))
    )
    projects = session.exec(statement).all()
    counts = dict(
        session.exec(
            select(Note.project_id, func.count())
            .where(col(Note.deleted_at).is_(None), col(Note.project_id).is_not(None))
            .group_by(Note.project_id)
        ).all()
    )
    return [
        ProjectListItem(id=p.id, name=p.name, note_count=counts.get(p.id, 0)) for p in projects
    ]


class NewProjectBody(BaseModel):
    name: str


@router.post("/create", response_model=ProjectResponse)
def create_project(body: NewProjectBody, session: SessionDep):
    normalized = body.name.strip()
    if not normalized:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project name cannot be empty")

    statement = select(Project).where(
        func.lower(Project.name) == normalized.lower(),
        col(Project.deleted_at).is_(None),
    )
    existing = session.exec(statement).one_or_none()
    if existing is not None:
        return existing

    project = Project(name=normalized)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@router.delete("/{project_id}", response_model=GroupDeleteResult)
def delete_project(
    project_id: int,
    session: SessionDep,
    delete_notes: bool = False,
    delete_unused_tags_too: bool = Query(False, alias="delete_orphan_tags"),
):
    """Deletes the project. Its notes are kept (they just lose the project,
    i.e. land in "no project") unless `delete_notes`, which moves them to the
    trash instead. Trashed notes lose the project too either way: the row they
    pointed at is gone.

    With `delete_notes`, `delete_orphan_tags` also deletes the tags those notes
    carried that no other (live) note uses -- e.g. the ones an import created."""
    project = session.exec(select(Project).where(Project.id == project_id)).one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    in_project = col(Note.project_id) == project_id
    live_notes = session.exec(
        select(func.count()).select_from(Note).where(in_project, col(Note.deleted_at).is_(None))
    ).one()
    trashed = trash_notes(session, in_project) if delete_notes else 0
    tags_deleted = 0
    if delete_notes and delete_unused_tags_too:
        # Before the notes lose their project below, or nothing is "in" it.
        project_tag_ids = (
            select(NoteTag.tag_id)
            .join(Note, col(Note.id) == col(NoteTag.note_id))
            .where(in_project)
        )
        tags_deleted = delete_unused_tags(session, among=project_tag_ids)

    session.exec(update(Note).where(in_project).values(project_id=None))  # type: ignore[call-overload]
    session.exec(delete(Project).where(col(Project.id) == project_id))  # type: ignore[call-overload]
    session.commit()
    return GroupDeleteResult(
        notes_trashed=trashed, notes_kept=live_notes - trashed, tags_deleted=tags_deleted
    )
