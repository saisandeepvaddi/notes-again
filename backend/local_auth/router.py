from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

import auth
from db.models import utcnow
from db.setup import SessionDep

from .passwords import MIN_PASSWORD_LENGTH, hash_password
from .service import (
    COOKIE_MAX_AGE,
    SESSION_COOKIE,
    check_credentials,
    clear_failed_logins,
    create_session,
    get_local_auth,
    login_blocked,
    record_failed_login,
    revoke_all_sessions,
    revoke_session,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthStatus(BaseModel):
    mode: auth.AuthMode
    configured_mode: auth.AuthMode
    authenticated: bool
    setup_required: bool
    username: str | None = None
    firebase: dict[str, str] | None = None


@router.get("/status", response_model=AuthStatus)
def auth_status(request: Request, session: SessionDep):
    mode = auth.effective_auth_mode(session)
    status_body = AuthStatus(
        mode=mode,
        configured_mode=auth.AUTH_MODE,
        authenticated=False,
        setup_required=False,
    )
    if mode == "none":
        status_body.authenticated = True
    elif mode == "local":
        record = get_local_auth(session)
        identity = auth.local_identity(request, session)
        status_body.authenticated = identity is not None
        status_body.setup_required = record is not None and not record.setup_completed
        if identity is not None:
            status_body.username = identity["username"]
    elif mode == "firebase":
        status_body.firebase = auth.firebase_web_config()
    return status_body


def _require_local_mode() -> None:
    if auth.AUTH_MODE != "local":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Username and password sign-in isn't enabled on this server",
        )


def _set_session_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )


class LoginBody(BaseModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=500)


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
def login(body: LoginBody, request: Request, response: Response, session: SessionDep):
    _require_local_mode()
    client_key = request.client.host if request.client else "unknown"
    if login_blocked(client_key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed attempts. Try again in a few minutes.",
        )
    record = get_local_auth(session)
    if not check_credentials(record, body.username, body.password):
        record_failed_login(client_key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    clear_failed_logins(client_key)
    _set_session_cookie(request, response, create_session(session))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, session: SessionDep):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(session, token)
    response.delete_cookie(SESSION_COOKIE, path="/")


class LocalAuthBody(BaseModel):
    enabled: bool
    username: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, max_length=500)
    current_password: str | None = Field(default=None, max_length=500)


@router.put("/local", status_code=status.HTTP_204_NO_CONTENT)
def update_local_auth(
    body: LocalAuthBody, request: Request, response: Response, session: SessionDep
):
    _require_local_mode()
    record = get_local_auth(session)
    if record is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sign-in isn't initialised yet")

    if record.enabled:
        if auth.local_identity(request, session) is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        if record.setup_completed and not check_credentials(
            record, record.username, body.current_password or ""
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is wrong")

    if body.enabled:
        username = (body.username or "").strip()
        password = body.password or ""
        if not username:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Username cannot be empty")
        if len(password) < MIN_PASSWORD_LENGTH:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
            )
        record.username = username
        record.password_hash = hash_password(password)

    record.enabled = body.enabled
    record.setup_completed = True
    record.initial_password = None
    record.updated_at = utcnow()
    session.add(record)
    session.commit()

    revoke_all_sessions(session)
    if body.enabled:
        _set_session_cookie(request, response, create_session(session))
    else:
        response.delete_cookie(SESSION_COOKIE, path="/")
