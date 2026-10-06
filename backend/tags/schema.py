from sqlmodel import SQLModel


class TagResponse(SQLModel):
    id: int
    name: str
    is_difficulty: bool


class TagListItem(TagResponse):
    note_count: int
    paused_count: int = 0
    note_only_count: int = 0
