from sqlmodel import SQLModel

from notes.scheduling.types import Algorithm


class SettingsResponse(SQLModel):
    default_algorithm: Algorithm
