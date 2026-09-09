from sqlmodel import SQLModel


class TagResponse(SQLModel):
    id: int
    name: str
