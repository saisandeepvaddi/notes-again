from sqlmodel import SQLModel


class ProjectResponse(SQLModel):
    id: int
    name: str
    paused: bool = False


class ProjectListItem(ProjectResponse):
    note_count: int
    paused_count: int = 0
