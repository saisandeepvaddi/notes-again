from sqlmodel import SQLModel


class ProjectResponse(SQLModel):
    id: int
    name: str
    # new notes in this project start paused (a default, see Project.paused)
    paused: bool = False


class ProjectListItem(ProjectResponse):
    # live (not trashed) notes in the project
    note_count: int
    # of those, how many are paused
    paused_count: int = 0
