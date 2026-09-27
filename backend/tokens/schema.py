from sqlmodel import SQLModel

from notes.schema import UTCDateTime


class TokenResponse(SQLModel):
    id: int
    name: str
    prefix: str
    scope: str
    created_at: UTCDateTime
    last_used_at: UTCDateTime | None = None
    expires_at: UTCDateTime | None = None


class CreatedTokenResponse(TokenResponse):
    token: str
