from contextlib import asynccontextmanager

from db.setup import close_db, setup_db
from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_db()
    yield
    close_db()


app = FastAPI()


@app.get("/")
def read_root():
    return {"version": "1.0.0"}
