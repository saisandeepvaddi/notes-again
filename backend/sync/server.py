from typing import Any, Literal, cast

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, col, select

from db.models import Note, Project, Settings, SyncTombstone, Tag
from db.setup import SessionDep

from .merge import merge_note, merge_record
from .payloads import (
    KINDS,
    SETTINGS_UID,
    Kind,
    Payload,
    apply,
    current_version,
    delete_row,
    dump_row,
    find_by_name,
    find_row,
)

router = APIRouter(prefix="/sync", tags=["sync"])

MAX_PULL = 500


class Change(BaseModel):
    kind: Kind
    uid: str
    base: Payload | None = None
    data: Payload | None = None


class PushBody(BaseModel):
    changes: list[Change]


class ChangeResult(BaseModel):
    kind: Kind
    uid: str
    status: Literal["ok", "conflict", "remapped", "deleted"]
    server_uid: str | None = None
    data: Payload | None = None


class PushResponse(BaseModel):
    results: list[ChangeResult]


class PulledChange(BaseModel):
    kind: Kind
    uid: str
    data: Payload | None = None


class PullResponse(BaseModel):
    version: int
    more: bool
    changes: list[PulledChange]


def _alias(payload: Payload | None, aliases: dict[str, str]) -> Payload | None:
    if payload is None or not aliases:
        return payload
    aliased = dict(payload)
    if aliased.get("project") in aliases:
        aliased["project"] = aliases[aliased["project"]]
    if "tags" in aliased:
        aliased["tags"] = sorted({aliases.get(uid, uid) for uid in aliased["tags"]})
    return aliased


def _tombstoned(session: Session, kind: Kind, uid: str) -> bool:
    return session.get(SyncTombstone, (kind, uid)) is not None


def _result(change: Change, status, row: Any = None, **extra) -> ChangeResult:
    data = dump_row(change.kind, row) if row is not None else None
    return ChangeResult(
        kind=change.kind, uid=change.uid, status=status, data=data, **extra
    )


def _push_deletion(session: Session, change: Change) -> ChangeResult:
    row = find_row(session, change.kind, change.uid)
    if row is None:
        return _result(change, "deleted")
    if change.base is None or dump_row(change.kind, row) == change.base:
        delete_row(session, change.kind, row)
        return _result(change, "deleted")
    return _result(change, "ok", row)


def _push_named(
    session: Session, change: Change, aliases: dict[str, str]
) -> ChangeResult:
    data = cast(Payload, change.data)
    row = find_row(session, change.kind, change.uid)
    if row is None:
        if change.base == data and _tombstoned(session, change.kind, change.uid):
            return _result(change, "deleted")
        same_name = find_by_name(session, change.kind, data["name"])
        if same_name is not None:
            aliases[change.uid] = same_name.uid
            return _result(change, "remapped", same_name, server_uid=same_name.uid)
        return _result(change, "ok", apply(session, change.kind, change.uid, data))
    if change.base is None:
        return _result(change, "ok", row)
    server = dump_row(change.kind, row)
    merged = merge_record(change.base, server, data)
    other = find_by_name(session, change.kind, merged["name"])
    if other is not None and other.uid != change.uid:
        merged["name"] = server["name"]
    if merged != server:
        row = apply(session, change.kind, change.uid, merged)
    return _result(change, "ok", row)


def _push_settings(session: Session, change: Change) -> ChangeResult:
    row = find_row(session, "settings", SETTINGS_UID)
    if row is None or change.base is None:
        row = row or apply(
            session, "settings", SETTINGS_UID, cast(Payload, change.data)
        )
        return _result(change, "ok", row)
    merged = merge_record(
        change.base, dump_row("settings", row), cast(Payload, change.data)
    )
    return _result(change, "ok", apply(session, "settings", SETTINGS_UID, merged))


def _push_note(
    session: Session, change: Change, aliases: dict[str, str]
) -> ChangeResult:
    data = cast(Payload, _alias(change.data, aliases))
    base = _alias(change.base, aliases)
    row = find_row(session, "note", change.uid)
    if row is None:
        if base == data and _tombstoned(session, "note", change.uid):
            return _result(change, "deleted")
        return _result(change, "ok", apply(session, "note", change.uid, data))
    server = dump_row("note", row)
    merged, conflict = merge_note(base if base is not None else server, server, data)
    if merged != server:
        row = apply(session, "note", change.uid, merged)
    return _result(change, "conflict" if conflict else "ok", row)


@router.post("/push", response_model=PushResponse)
def push(body: PushBody, session: SessionDep):
    aliases: dict[str, str] = {}
    results = []
    for change in sorted(body.changes, key=lambda c: KINDS.index(c.kind)):
        if change.data is None:
            results.append(_push_deletion(session, change))
        elif change.kind == "settings":
            results.append(_push_settings(session, change))
        elif change.kind == "note":
            results.append(_push_note(session, change, aliases))
        else:
            results.append(_push_named(session, change, aliases))
    session.commit()
    return PushResponse(results=results)


@router.get("/pull", response_model=PullResponse)
def pull(
    session: SessionDep,
    since: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=MAX_PULL),
):
    notes = session.exec(
        select(Note)
        .where(col(Note.sync_version) > since)
        .order_by(col(Note.sync_version))
        .limit(limit + 1)
        .options(
            selectinload(cast(Any, Note.reminders)),
            selectinload(cast(Any, Note.tags)),
            selectinload(cast(Any, Note.project)),
        )
    ).all()
    more = len(notes) > limit
    notes = notes[:limit]
    version = notes[-1].sync_version if more else current_version(session)

    changes: list[PulledChange] = []
    settings = session.get(Settings, 1)
    if settings is not None and settings.sync_version > since:
        changes.append(
            PulledChange(
                kind="settings", uid=SETTINGS_UID, data=dump_row("settings", settings)
            )
        )
    for kind, model in (("project", Project), ("tag", Tag)):
        rows = session.exec(select(model).where(col(model.sync_version) > since)).all()
        changes += [
            PulledChange(kind=kind, uid=row.uid, data=dump_row(kind, row))
            for row in rows
        ]
    changes += [
        PulledChange(kind="note", uid=note.uid, data=dump_row("note", note))
        for note in notes
    ]
    tombstones = session.exec(
        select(SyncTombstone).where(col(SyncTombstone.version) > since)
    ).all()
    changes += [
        PulledChange(kind=cast(Kind, tombstone.kind), uid=tombstone.uid)
        for tombstone in tombstones
    ]
    return PullResponse(version=version, more=more, changes=changes)
