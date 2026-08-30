from fastapi import APIRouter

router = APIRouter()


@router.get("/list", tags=["notes"])
async def get_notes():
    return []
