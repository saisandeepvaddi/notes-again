from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import Session

from db.models import Settings
from db.setup import SessionDep
from notes.scheduling.types import Algorithm

from .schema import SettingsResponse

router = APIRouter(prefix="/settings", tags=["settings"])


def get_or_create_settings(session: Session) -> Settings:
    settings = session.get(Settings, 1)
    if settings is None:
        settings = Settings(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


@router.get("", response_model=SettingsResponse)
def read_settings(session: SessionDep):
    return get_or_create_settings(session)


class UpdateSettingsBody(BaseModel):
    default_algorithm: Algorithm


@router.patch("", response_model=SettingsResponse)
def update_settings(body: UpdateSettingsBody, session: SessionDep):
    settings = get_or_create_settings(session)
    settings.default_algorithm = body.default_algorithm
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return settings
