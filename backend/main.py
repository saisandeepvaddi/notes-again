from contextlib import asynccontextmanager

from fastapi import FastAPI

from db.setup import setup_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = setup_db()
    yield
    if db:
        db.close()


app = FastAPI(lifespan=lifespan)


@app.get("/")
def read_root():
    return {"version": "1.0.0"}
