from fastapi import APIRouter

from notes.router import router as notes_router

router = APIRouter(prefix="/api")
router.include_router(notes_router)
