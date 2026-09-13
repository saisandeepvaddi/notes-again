from sqlmodel import SQLModel


class ProjectResponse(SQLModel):
    id: int
    name: str
