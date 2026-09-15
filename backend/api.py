from fastapi import APIRouter, Depends

from auth import require_user
from notes.router import router as notes_router
from projects.router import router as projects_router
from settings.router import router as settings_router
from tags.router import router as tags_router

router = APIRouter(prefix="/api", dependencies=[Depends(require_user)])
router.include_router(notes_router)
router.include_router(tags_router)
router.include_router(projects_router)
router.include_router(settings_router)
