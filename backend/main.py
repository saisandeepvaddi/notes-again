from contextlib import asynccontextmanager

from fastapi import FastAPI

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


@app.get("/")
def read_root():
    return {"version": "1.0.0"}
