import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import auth
from api import router as api_router
from backups.service import run_snapshot_schedule
from db.setup import setup_db
from local_auth.router import router as auth_router
from local_auth.service import ensure_local_auth
from sync.local import run_sync_schedule
from trusted_proxies import ForwardedHeadersMiddleware

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = setup_db()
    if not engine:
        log.error("error setting up db. stopping")
        raise RuntimeError("DB setup failed")
    if auth.AUTH_MODE == "local":
        ensure_local_auth(engine)
    app.state.engine = engine
    tasks = [asyncio.create_task(run_snapshot_schedule(engine))]
    if auth.AUTH_MODE == "desktop":
        tasks.append(asyncio.create_task(run_sync_schedule(engine)))
    yield
    for task in tasks:
        task.cancel()
    engine.dispose()
    log.info("DB Engine disposed")


app = FastAPI(lifespan=lifespan)

cors_origins = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
]
cors_origin_regex = os.environ.get("CORS_ORIGIN_REGEX") or None
if cors_origins or cors_origin_regex:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

app.add_middleware(ForwardedHeadersMiddleware)

app.include_router(router=auth_router)
app.include_router(router=api_router, tags=["api"])


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


default_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "client"
frontend_dist = Path(os.environ.get("FRONTEND_DIST", default_dist))
index_file = frontend_dist / "index.html"

if (frontend_dist / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")


@app.get("/{full_path:path}")
async def spa(full_path: str) -> Response:
    if full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"message": "Not found"})
    root = frontend_dist.resolve()
    candidate = (root / full_path).resolve()
    if full_path and candidate.is_relative_to(root) and candidate.is_file():
        return FileResponse(candidate)
    if index_file.is_file():
        return FileResponse(index_file, media_type="text/html")
    return JSONResponse(status_code=404, content={"message": "Frontend not built"})
