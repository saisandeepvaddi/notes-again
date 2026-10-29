import datetime
import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, Literal

from sqlalchemy import delete, func, text, update
from sqlmodel import Session, col, select

from db.models import Note, NoteTag, Project, Reminder, Settings, SyncBase, Tag
from notes.utils import to_utc_iso

Kind = Literal["settings", "project", "tag", "note"]
KINDS: tuple[Kind, ...] = ("settings", "project", "tag", "note")
SETTINGS_UID = "settings"

Payload = dict[str, Any]

FIELDS: dict[str, dict[str, bool]] = {
    "settings": {"default_algorithm": False},
    "project": {"name": False, "created_at": True, "deleted_at": True, "paused": False},
    "tag": {
        "name": False,
        "created_at": True,
        "is_difficulty": False,
        "default_ease_factor": False,
    },
    "note": {
        "name": False,
        "content": False,
        "created_at": True,
        "updated_at": True,
        "deleted_at": True,
        "paused_at": True,
        "in_review": False,
        "ease_factor": False,
        "interval_days": False,
        "algorithm": False,
        "fsrs_card": False,
    },
    "reminder": {
        "remind_at": True,
        "created_at": True,
        "updated_at": True,
        "deleted_at": True,
        "reviewed_at": True,
        "rating": False,
        "ease_factor": False,
        "interval_days": False,
        "fsrs_card": False,
    },
}
TEXT_FIELDS = ("name", "content")
MODELS = {"project": Project, "tag": Tag, "note": Note}


def _dump(row: Any, fields: dict[str, bool]) -> Payload:
    payload = {}
    for name, is_datetime in fields.items():
        value = getattr(row, name)
        payload[name] = (
            to_utc_iso(value) if is_datetime and value is not None else value
        )
    return payload


def _load(row: Any, data: Payload, fields: dict[str, bool], skip=()) -> None:
    for name, is_datetime in fields.items():
        if name in skip or name not in data:
            continue
        value = data[name]
        if is_datetime and value is not None:
            value = datetime.datetime.fromisoformat(value)
        setattr(row, name, value)


def dump_row(kind: Kind, row: Any) -> Payload:
    payload = _dump(row, FIELDS[kind])
    if kind == "note":
        payload["project"] = row.project.uid if row.project is not None else None
        payload["tags"] = sorted(tag.uid for tag in row.tags)
        payload["reminders"] = {
            reminder.uid: _dump(reminder, FIELDS["reminder"])
            for reminder in row.reminders
        }
    return payload


def find_row(session: Session, kind: Kind, uid: str) -> Any:
    if kind == "settings":
        return session.get(Settings, 1)
    model = MODELS[kind]
    return session.exec(select(model).where(model.uid == uid)).one_or_none()


def find_by_name(session: Session, kind: Kind, name: str) -> Any:
    model = MODELS[kind]
    return session.exec(
        select(model).where(func.lower(model.name) == name.lower())
    ).one_or_none()


def row_uid(kind: Kind, row: Any) -> str:
    return SETTINGS_UID if kind == "settings" else row.uid


def dump(session: Session, kind: Kind, uid: str) -> Payload | None:
    row = find_row(session, kind, uid)
    return None if row is None else dump_row(kind, row)


def _apply_note(session: Session, note: Note, data: Payload, keep_text: bool) -> None:
    with session.no_autoflush:
        project_uid = data.get("project")
        project = (
            find_row(session, "project", project_uid)
            if project_uid is not None
            else None
        )
        tag_uids = data.get("tags", [])
        tags = (
            list(session.exec(select(Tag).where(col(Tag.uid).in_(tag_uids))).all())
            if tag_uids
            else []
        )
        _load(note, data, FIELDS["note"], skip=TEXT_FIELDS if keep_text else ())
        note.project = project
        note.tags = tags
        existing = {reminder.uid: reminder for reminder in note.reminders}
        for uid, reminder_data in data.get("reminders", {}).items():
            reminder = existing.pop(uid, None)
            if reminder is None:
                reminder = Reminder(uid=uid)
                note.reminders.append(reminder)
            _load(reminder, reminder_data, FIELDS["reminder"])
        for reminder in existing.values():
            note.reminders.remove(reminder)
            session.delete(reminder)


def apply(
    session: Session, kind: Kind, uid: str, data: Payload, *, keep_text: bool = False
) -> Any:
    row = find_row(session, kind, uid)
    if row is None:
        if kind == "settings":
            row = Settings(id=1)
        elif kind == "note":
            row = Note(uid=uid, user_id=1, name=data["name"], content=data["content"])
        else:
            row = MODELS[kind](uid=uid, name=data["name"])
    if kind == "note":
        _apply_note(session, row, data, keep_text and row.id is not None)
    else:
        _load(row, data, FIELDS[kind])
    session.add(row)
    session.flush()
    return row


def delete_row(session: Session, kind: Kind, row: Any) -> None:
    if kind == "project":
        session.exec(  # type: ignore[call-overload]
            update(Note).where(col(Note.project_id) == row.id).values(project_id=None)
        )
    elif kind == "tag":
        session.exec(delete(NoteTag).where(col(NoteTag.tag_id) == row.id))  # type: ignore[call-overload]
    session.delete(row)
    session.flush()


def load_base(session: Session, kind: Kind, uid: str) -> Payload | None:
    base = session.get(SyncBase, (kind, uid))
    return None if base is None else json.loads(base.payload)


def save_base(session: Session, kind: Kind, uid: str, data: Payload | None) -> None:
    base = session.get(SyncBase, (kind, uid))
    if data is None:
        if base is not None:
            session.delete(base)
        return
    payload = json.dumps(data, sort_keys=True)
    if base is None:
        session.add(SyncBase(kind=kind, uid=uid, payload=payload))
    else:
        base.payload = payload
        session.add(base)


@contextmanager
def applying_remote_changes(session: Session) -> Iterator[None]:
    session.connection().execute(
        text("UPDATE sync_state SET applying = 1 WHERE id = 1")
    )
    try:
        yield
        session.flush()
    finally:
        session.connection().execute(
            text("UPDATE sync_state SET applying = 0 WHERE id = 1")
        )


def current_version(session: Session) -> int:
    return (
        session.connection()
        .execute(text("SELECT version FROM sync_state WHERE id = 1"))
        .scalar_one()
    )
