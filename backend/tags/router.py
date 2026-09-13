from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import func, select

from db.models import Tag
from db.setup import SessionDep

from .schema import TagResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("/list", response_model=list[TagResponse])
def get_tags(session: SessionDep):
    statement = select(Tag).order_by(func.lower(Tag.name))
    return session.exec(statement).all()


class NewTagBody(BaseModel):
    name: str
    is_project: bool = False


@router.post("/create", response_model=TagResponse)
def create_tag(body: NewTagBody, session: SessionDep):
    normalized = body.name.strip()
    if not normalized:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tag name cannot be empty")

    statement = select(Tag).where(func.lower(Tag.name) == normalized.lower())
    existing = session.exec(statement).one_or_none()
    if existing is not None:
        if existing.is_project != body.is_project:
            # Tag.name is globally unique, and a tag/project are different
            # kinds of thing -- silently handing back the wrong kind here
            # previously let a project *lookup* quietly resolve to a plain
            # tag, which then 404'd wherever project-only checks applied it.
            existing_kind = "a project" if existing.is_project else "a tag"
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f'"{normalized}" already exists as {existing_kind}. Choose a different name.',
            )
        return existing

    tag = Tag(name=normalized, is_project=body.is_project)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: int, session: SessionDep):
    tag = session.exec(select(Tag).where(Tag.id == tag_id)).one_or_none()
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    session.delete(tag)
    session.commit()
