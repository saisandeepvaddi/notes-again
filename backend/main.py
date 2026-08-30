from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def read_root():
    return {"version": "1.0.0"}
