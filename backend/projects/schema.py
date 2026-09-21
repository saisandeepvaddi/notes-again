from sqlmodel import SQLModel


class ProjectResponse(SQLModel):
    id: int
    name: str


class ProjectListItem(ProjectResponse):
    # live (not trashed) notes in the project
    note_count: int
