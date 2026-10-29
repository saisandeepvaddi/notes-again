import threading
from typing import Any, NamedTuple, cast

import httpx
from sqlalchemy import Engine
from sqlmodel import Session, col, select

from db.models import (
    Note,
    Project,
    Settings,
    SyncConflict,
    SyncRemote,
    SyncTombstone,
    Tag,
    utcnow,
)

from .payloads import (
    KINDS,
    SETTINGS_UID,
    TEXT_FIELDS,
    Kind,
    Payload,
    apply,
    applying_remote_changes,
    current_version,
    delete_row,
    dump,
    find_by_name,
    find_row,
    load_base,
    row_uid,
    save_base,
)

NOTES_PER_PUSH = 100

_lock = threading.Lock()


class Pending(NamedTuple):
    kind: Kind
    uid: str
    version: int
    deleted: bool


class SyncOutcome(NamedTuple):
    pushed: int
    pulled: int
    conflicts: int


class NotConnected(Exception):
    pass


def _pending_changes(session: Session, since: int, until: int) -> list[Pending]:
    conflicted = set(session.exec(select(SyncConflict.note_uid)).all())
    pending: list[Pending] = []
    settings = session.get(Settings, 1)
    if settings is not None and since < settings.sync_version <= until:
        pending.append(Pending("settings", SETTINGS_UID, settings.sync_version, False))
    for kind, model in (("project", Project), ("tag", Tag), ("note", Note)):
        rows = session.exec(
            select(model.uid, model.sync_version).where(
                col(model.sync_version) > since, col(model.sync_version) <= until
            )
        ).all()
        pending += [
            Pending(cast(Kind, kind), uid, version, False)
            for uid, version in rows
            if not (kind == "note" and uid in conflicted)
        ]
    tombstones = session.exec(
        select(SyncTombstone).where(
            col(SyncTombstone.version) > since, col(SyncTombstone.version) <= until
        )
    ).all()
    pending += [Pending(cast(Kind, t.kind), t.uid, t.version, True) for t in tombstones]
    return sorted(pending, key=lambda p: (KINDS.index(p.kind), p.version))


def _batches(pending: list[Pending]) -> list[list[Pending]]:
    meta = [p for p in pending if p.kind != "note"]
    notes = [p for p in pending if p.kind == "note"]
    batches = [meta + notes[:NOTES_PER_PUSH]]
    batches += [
        notes[start : start + NOTES_PER_PUSH]
        for start in range(NOTES_PER_PUSH, len(notes), NOTES_PER_PUSH)
    ]
    return [batch for batch in batches if batch]


def _unchanged_since(row: Any, item: Pending) -> bool:
    return row is not None and row.sync_version == item.version


def _record_conflict(session: Session, uid: str, theirs: Payload) -> None:
    conflict = session.get(SyncConflict, uid) or SyncConflict(
        note_uid=uid, their_name="", their_content=""
    )
    conflict.their_name = theirs["name"]
    conflict.their_content = theirs["content"]
    conflict.detected_at = utcnow()
    session.add(conflict)


def _clear_conflict(session: Session, uid: str) -> None:
    conflict = session.get(SyncConflict, uid)
    if conflict is not None:
        session.delete(conflict)


def _handle_result(session: Session, item: Pending, result: dict) -> None:
    status, data = result["status"], result.get("data")
    row = find_row(session, item.kind, item.uid)
    if status == "deleted":
        if row is not None and (item.deleted or _unchanged_since(row, item)):
            delete_row(session, item.kind, row)
        save_base(session, item.kind, item.uid, None)
        _clear_conflict(session, item.uid)
        return
    if status == "remapped":
        server_uid = result["server_uid"]
        if row is not None:
            row.uid = server_uid
            session.add(row)
            session.flush()
        save_base(session, item.kind, item.uid, None)
        apply(session, item.kind, server_uid, data)
        save_base(session, item.kind, server_uid, data)
        return
    unchanged = item.deleted or _unchanged_since(row, item)
    if status == "conflict":
        if unchanged:
            apply(session, item.kind, item.uid, data, keep_text=True)
        _record_conflict(session, item.uid, data)
    elif unchanged:
        apply(session, item.kind, item.uid, data)
    save_base(session, item.kind, item.uid, data)


def _push(engine: Engine, http: httpx.Client) -> int:
    with Session(engine) as session:
        remote = session.get(SyncRemote, 1)
        if remote is None:
            raise NotConnected
        since, until = remote.pushed_version, current_version(session)
        pending = _pending_changes(session, since, until)

    for batch in _batches(pending):
        with Session(engine) as session:
            changes = []
            for item in batch:
                data = None if item.deleted else dump(session, item.kind, item.uid)
                changes.append(
                    {
                        "kind": item.kind,
                        "uid": item.uid,
                        "base": load_base(session, item.kind, item.uid),
                        "data": data,
                    }
                )
        response = http.post("/api/sync/push", json={"changes": changes})
        response.raise_for_status()
        results = {(r["kind"], r["uid"]): r for r in response.json()["results"]}
        with Session(engine) as session:
            with applying_remote_changes(session):
                for item in batch:
                    _handle_result(session, item, results[(item.kind, item.uid)])
            session.commit()

    with Session(engine) as session:
        remote = cast(SyncRemote, session.get(SyncRemote, 1))
        remote.pushed_version = until
        session.add(remote)
        session.commit()
    return len(pending)


def _apply_pulled(
    session: Session, kind: Kind, uid: str, data: Payload | None, pushed: int
) -> bool:
    row = find_row(session, kind, uid)
    if row is not None and row.sync_version > pushed:
        return False
    if data is None:
        if row is not None:
            delete_row(session, kind, row)
        save_base(session, kind, uid, None)
        _clear_conflict(session, uid)
        return row is not None
    if row is not None and load_base(session, kind, uid) == data:
        return False
    if row is None and kind in ("project", "tag"):
        same_name = find_by_name(session, kind, data["name"])
        if same_name is not None:
            save_base(session, kind, row_uid(kind, same_name), None)
            same_name.uid = uid
            session.add(same_name)
            session.flush()
    conflict = session.get(SyncConflict, uid) if kind == "note" else None
    if conflict is not None and row is not None:
        apply(session, kind, uid, data, keep_text=True)
        mine = {name: getattr(row, name) for name in TEXT_FIELDS}
        if mine == {name: data[name] for name in TEXT_FIELDS}:
            session.delete(conflict)
        else:
            _record_conflict(session, uid, data)
    else:
        apply(session, kind, uid, data)
    save_base(session, kind, uid, data)
    return True


def _pull(engine: Engine, http: httpx.Client) -> int:
    applied = 0
    while True:
        with Session(engine) as session:
            remote = cast(SyncRemote, session.get(SyncRemote, 1))
            since, pushed = remote.pulled_version, remote.pushed_version
        response = http.get("/api/sync/pull", params={"since": since})
        response.raise_for_status()
        page = response.json()
        changes = page["changes"]
        ordered = sorted(
            changes,
            key=lambda c: (c["data"] is None, KINDS.index(c["kind"])),
        )
        with Session(engine) as session:
            with applying_remote_changes(session):
                for change in ordered:
                    if _apply_pulled(
                        session, change["kind"], change["uid"], change["data"], pushed
                    ):
                        applied += 1
            remote = cast(SyncRemote, session.get(SyncRemote, 1))
            remote.pulled_version = page["version"]
            session.add(remote)
            session.commit()
        if not page["more"]:
            return applied


def sync_once(engine: Engine, http: httpx.Client) -> SyncOutcome:
    with _lock:
        pushed = _push(engine, http)
        pulled = _pull(engine, http)
        with Session(engine) as session:
            remote = cast(SyncRemote, session.get(SyncRemote, 1))
            remote.last_synced_at = utcnow()
            if pulled:
                remote.last_changed_at = remote.last_synced_at
            remote.last_error = None
            session.add(remote)
            conflicts = len(session.exec(select(SyncConflict.note_uid)).all())
            session.commit()
    return SyncOutcome(pushed=pushed, pulled=pulled, conflicts=conflicts)


def resolve_conflict(engine: Engine, note_uid: str, *, name: str, content: str) -> bool:
    with Session(engine) as session:
        conflict = session.get(SyncConflict, note_uid)
        note = find_row(session, "note", note_uid)
        if conflict is None or note is None:
            return False
        note.name = name
        note.content = content
        note.updated_at = utcnow()
        session.add(note)
        session.delete(conflict)
        session.commit()
    return True
