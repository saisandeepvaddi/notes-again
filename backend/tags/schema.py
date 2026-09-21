from sqlmodel import SQLModel


class TagResponse(SQLModel):
    id: int
    name: str
    is_difficulty: bool


class TagListItem(TagResponse):
    # live (not trashed) notes carrying the tag
    note_count: int
