import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api import router as api_router
from db.setup import get_session, setup_db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = setup_db()
    if not engine:
        log.error("error setting up db. stopping")
        return
    app.state.session = get_session(engine=engine)
    yield
    if engine:
        engine.dispose()
        log.info("DB Engine disposed")


app = FastAPI(lifespan=lifespan)
app.include_router(router=api_router, tags=["api"])

ui_build_path = Path.cwd() / "frontend" / "dist"

app.mount("/static", StaticFiles(directory=ui_build_path), name="static")


async def get_index_response(request: Request) -> Response:
    index_path = ui_build_path / "index.html"
    print(index_path)
    return FileResponse(index_path, status_code=200, media_type="text/html")


@app.get("/")
async def read_index(request: Request) -> Response:
    return await get_index_response(request=request)


@app.get("/{full_path:path}")
async def catch_all(request: Request, full_path: str) -> Response:
    if full_path.startswith(("api/", "static/")):
        return JSONResponse(status_code=404, content={"message": "Not found"})
    return await get_index_response(request=request)
