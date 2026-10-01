from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import col, select

from auth import require_session_user
from db.models import ApiToken
from db.setup import SessionDep

from .schema import CreatedTokenResponse, TokenResponse
from .service import CAPTURE_SCOPE, issue_token, revoke

router = APIRouter(prefix="/tokens", tags=["tokens"], dependencies=[Depends(require_session_user)])


@router.get("/list", response_model=list[TokenResponse])
def list_tokens(session: SessionDep):
    statement = (
        select(ApiToken)
        .where(col(ApiToken.revoked_at).is_(None))
        .order_by(col(ApiToken.created_at).desc())
    )
    return session.exec(statement).all()


class NewTokenBody(BaseModel):
    name: str = Field(max_length=80)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)
    scope: Literal["capture", "app"] = CAPTURE_SCOPE


@router.post("/create", response_model=CreatedTokenResponse)
def create_token(
    body: NewTokenBody,
    session: SessionDep,
    identity: Annotated[dict, Depends(require_session_user)],
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token name cannot be empty")

    record, token = issue_token(
        session,
        name=name,
        scope=body.scope,
        created_by=identity.get("email") or None,
        expires_in_days=body.expires_in_days,
    )
    return CreatedTokenResponse(**record.model_dump(), token=token)


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_token(token_id: int, session: SessionDep):
    record = session.get(ApiToken, token_id)
    if record is None or record.revoked_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    revoke(session, record)
