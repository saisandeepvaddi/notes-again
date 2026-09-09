from fastapi import APIRouter

from notes.router import router as notes_router
from tags.router import router as tags_router

router = APIRouter(prefix="/api")
router.include_router(notes_router)
router.include_router(tags_router)
