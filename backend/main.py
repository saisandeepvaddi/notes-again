from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api import router as api_router
from backend.db.models import get_models_dict
from db.setup import setup_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = setup_db()
    app.state.models = get_models_dict()
    yield
    if db:
        db.close()


app = FastAPI(lifespan=lifespan)
app.include_router(router=api_router, tags=["api"])

ui_build_path = Path.cwd() / "frontend" / "dist"

app.mount("/static", StaticFiles(directory=ui_build_path), name="static")


async def get_index_response(request: Request) -> Response:
    index_path = ui_build_path / "index.html"
    return FileResponse(index_path, status_code=200, media_type="text/html")


@app.get("/")
async def read_index(request: Request) -> Response:
    return await get_index_response(request=request)


@app.get("/{full_path:path}")
async def catch_all(request: Request, full_path: str) -> Response:
    if full_path.startswith(("api/", "static/")):
        return JSONResponse(status_code=404, content={"message": "Not found"})
    return await get_index_response(request=request)
