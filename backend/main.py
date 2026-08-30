from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    pass


app = FastAPI()


@app.get("/")
def read_root():
    return {"version": "1.0.0"}
