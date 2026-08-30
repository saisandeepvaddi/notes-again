from fastapi import APIRouter

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("/list")
async def get_notes():
    return []
