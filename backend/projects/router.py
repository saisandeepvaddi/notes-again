from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import case, delete, update
from sqlmodel import Session, col, func, select

from db.models import Note, NoteTag, Project
from db.setup import SessionDep
from notes.bulk import (
    GroupDeleteResult,
    ResumeOptions,
    ResumeResult,
    add_to_review,
    pause_notes,
    remove_from_review,
    resume_notes,
    trash_notes,
)
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
    counts = {
        project_id: (total, paused or 0, note_only or 0)
        for project_id, total, paused, note_only in session.exec(
            select(
                Note.project_id,
                func.count(),
                func.count(col(Note.paused_at)),
                func.count(case((col(Note.in_review).is_(False), 1))),
            )
            .where(col(Note.deleted_at).is_(None), col(Note.project_id).is_not(None))
            .group_by(Note.project_id)
        ).all()
    }
    return [
        ProjectListItem(
            id=p.id,
            name=p.name,
            paused=p.paused,
            note_count=counts.get(p.id, (0, 0, 0))[0],
            paused_count=counts.get(p.id, (0, 0, 0))[1],
            note_only_count=counts.get(p.id, (0, 0, 0))[2],
        )
        for p in projects
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


def _live_project(session: Session, project_id: int) -> Project:
    project = session.exec(
        select(Project).where(Project.id == project_id, col(Project.deleted_at).is_(None))
    ).one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


class PauseResult(BaseModel):
    affected: int


@router.post("/{project_id}/pause", response_model=PauseResult)
def pause_project(project_id: int, session: SessionDep):
    project = _live_project(session, project_id)
    project.paused = True
    session.add(project)
    affected = pause_notes(session, col(Note.project_id) == project_id)
    session.commit()
    return PauseResult(affected=affected)


@router.post("/{project_id}/resume", response_model=ResumeResult)
def resume_project(project_id: int, body: ResumeOptions, session: SessionDep):
    project = _live_project(session, project_id)
    project.paused = False
    session.add(project)
    result = resume_notes(
        session,
        col(Note.project_id) == project_id,
        per_day=body.per_day,
        tz_offset_minutes=body.tz_offset_minutes,
    )
    session.commit()
    return result


@router.post("/{project_id}/remove-from-review", response_model=PauseResult)
def remove_project_from_review(project_id: int, session: SessionDep):
    _live_project(session, project_id)
    affected = remove_from_review(session, col(Note.project_id) == project_id)
    session.commit()
    return PauseResult(affected=affected)


@router.post("/{project_id}/add-to-review", response_model=ResumeResult)
def add_project_to_review(project_id: int, body: ResumeOptions, session: SessionDep):
    _live_project(session, project_id)
    result = add_to_review(
        session,
        col(Note.project_id) == project_id,
        per_day=body.per_day,
        tz_offset_minutes=body.tz_offset_minutes,
    )
    session.commit()
    return result


@router.delete("/{project_id}", response_model=GroupDeleteResult)
def delete_project(
    project_id: int,
    session: SessionDep,
    delete_notes: bool = False,
    delete_unused_tags_too: bool = Query(False, alias="delete_orphan_tags"),
):
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
