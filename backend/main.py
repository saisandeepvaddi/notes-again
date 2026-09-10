import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api import router as api_router
from db.setup import setup_db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = setup_db()
    if not engine:
        log.error("error setting up db. stopping")
        raise RuntimeError("DB setup failed")
    app.state.engine = engine
    yield
    engine.dispose()
    log.info("DB Engine disposed")


app = FastAPI(lifespan=lifespan)

# In production the SPA is served same-origin by this app, so no CORS is needed.
# For local dev the Vite server is a separate origin — set CORS_ORIGINS
# (comma-separated), e.g. "http://localhost:5173,http://192.168.1.11:5173".
cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(router=api_router, tags=["api"])

# The built SPA (frontend/dist/client after `pnpm build`): an index.html shell
# plus /assets/*. Absent in pure API-dev mode, where Vite serves the frontend.
default_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "client"
frontend_dist = Path(os.environ.get("FRONTEND_DIST", default_dist))
index_file = frontend_dist / "index.html"

if (frontend_dist / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")


@app.get("/{full_path:path}")
async def spa(full_path: str) -> Response:
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"message": "Not found"})
    if index_file.is_file():
        return FileResponse(index_file, media_type="text/html")
    return JSONResponse(status_code=404, content={"message": "Frontend not built"})
