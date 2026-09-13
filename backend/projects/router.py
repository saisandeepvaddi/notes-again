from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import col, func, select

from db.models import Note, Project
from db.setup import SessionDep

from .schema import ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/list", response_model=list[ProjectResponse])
def get_projects(session: SessionDep):
    statement = (
        select(Project)
        .where(col(Project.deleted_at).is_(None))
        .order_by(func.lower(Project.name))
    )
    return session.exec(statement).all()


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


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, session: SessionDep):
    project = session.exec(
        select(Project).where(Project.id == project_id)
    ).one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    notes = session.exec(select(Note).where(Note.project_id == project_id)).all()
    for note in notes:
        note.project_id = None
        session.add(note)

    session.delete(project)
    session.commit()
