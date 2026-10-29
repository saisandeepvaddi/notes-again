import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, col, select

from db.models import (
    Note,
    Project,
    Reminder,
    Settings,
    SyncConflict,
    SyncRemote,
    Tag,
    utcnow,
)
from db.setup import create_engine_for
from main import app
from notes.factory import build_note
from notes.scheduling import record_review
from sync.client import resolve_conflict, sync_once


def make_desktop(tmp_path, name: str) -> Engine:
    engine = create_engine_for(tmp_path / f"{name}.db")
    with Session(engine) as session:
        session.add(SyncRemote(url="http://testserver", token="unused"))
        session.commit()
    return engine


@pytest.fixture
def desktop(tmp_path) -> Engine:
    return make_desktop(tmp_path, "desktop")


def get_or_create(session: Session, model, name: str):
    row = session.exec(select(model).where(model.name == name)).one_or_none()
    if row is None:
        row = model(name=name)
        session.add(row)
    return row


def add_note(
    engine: Engine,
    name: str,
    content: str = "body",
    project: str | None = None,
    tags: tuple[str, ...] = (),
) -> str:
    with Session(engine) as session:
        medium = session.exec(select(Tag).where(Tag.name == "Medium")).one()
        note = build_note(
            name=name,
            content=content,
            algorithm="fsrs",
            difficulty_tag=medium,
            tags=[get_or_create(session, Tag, tag) for tag in tags],
            project=get_or_create(session, Project, project) if project else None,
            first_reminder_at=utcnow() - datetime.timedelta(hours=1),
        )
        session.add(note)
        session.commit()
        return note.uid


def local_note(engine: Engine, uid: str) -> Note | None:
    with Session(engine) as session:
        note = session.exec(select(Note).where(Note.uid == uid)).one_or_none()
        if note is not None:
            _ = (note.tags, note.reminders, note.project)
        return note


def edit_local(engine: Engine, uid: str, **fields) -> None:
    with Session(engine) as session:
        note = session.exec(select(Note).where(Note.uid == uid)).one()
        for name, value in fields.items():
            setattr(note, name, value)
        session.add(note)
        session.commit()


def review_local(engine: Engine, uid: str, rating: str) -> None:
    with Session(engine) as session:
        note = session.exec(select(Note).where(Note.uid == uid)).one()
        pending = next(r for r in note.reminders if r.reviewed_at is None)
        next_reminder = record_review(note, pending, rating)
        session.add_all([pending, note, next_reminder])
        session.commit()


def server_id(uid: str) -> int:
    with Session(app.state.engine) as session:
        return session.exec(select(Note.id).where(Note.uid == uid)).one()


def server_note(client: TestClient, uid: str) -> dict:
    return client.get(f"/api/notes/{server_id(uid)}").json()


def pending_reminders(note: dict) -> list[dict]:
    return [r for r in note["reminders"] if r["reviewed_at"] is None]


def test_a_note_written_on_one_desktop_reaches_the_server_and_another_desktop(
    client, tmp_path, desktop
):
    uid = add_note(desktop, "Rust ownership", "Moves", project="Rust", tags=("lang",))
    outcome = sync_once(desktop, client)
    assert outcome.pushed > 0

    on_server = server_note(client, uid)
    assert on_server["name"] == "Rust ownership"
    assert on_server["project"]["name"] == "Rust"
    assert sorted(t["name"] for t in on_server["tags"]) == ["Medium", "lang"]
    assert [t["name"] for t in client.get("/api/tags/list").json()].count("Medium") == 1

    laptop = make_desktop(tmp_path, "laptop")
    sync_once(laptop, client)
    copy = local_note(laptop, uid)
    assert copy is not None
    assert copy.content == "Moves"
    assert copy.project is not None and copy.project.name == "Rust"
    assert sorted(t.name for t in copy.tags) == ["Medium", "lang"]
    assert len([r for r in copy.reminders if r.reviewed_at is None]) == 1


def test_syncing_again_without_changes_moves_nothing(client, desktop):
    add_note(desktop, "Stable")
    sync_once(desktop, client)
    again = sync_once(desktop, client)
    assert (again.pushed, again.pulled, again.conflicts) == (0, 0, 0)


def test_server_edits_reach_the_desktop(client, desktop):
    uid = add_note(desktop, "Draft")
    sync_once(desktop, client)
    client.patch(
        f"/api/notes/{server_id(uid)}",
        json={"name": "Draft", "content": "From the web"},
    )
    sync_once(desktop, client)
    assert local_note(desktop, uid).content == "From the web"


def test_edits_to_different_notes_on_each_side_both_survive(client, desktop):
    first = add_note(desktop, "First")
    second = add_note(desktop, "Second")
    sync_once(desktop, client)

    edit_local(desktop, first, content="Desktop edit")
    client.patch(
        f"/api/notes/{server_id(second)}",
        json={"name": "Second", "content": "Web edit"},
    )
    outcome = sync_once(desktop, client)

    assert outcome.conflicts == 0
    assert server_note(client, first)["content"] == "Desktop edit"
    assert local_note(desktop, second).content == "Web edit"


def test_editing_the_same_note_on_both_sides_is_a_conflict(client, desktop):
    uid = add_note(desktop, "Shared", "Original")
    sync_once(desktop, client)

    edit_local(desktop, uid, content="Mine")
    client.patch(
        f"/api/notes/{server_id(uid)}", json={"name": "Shared", "content": "Theirs"}
    )
    outcome = sync_once(desktop, client)

    assert outcome.conflicts == 1
    assert local_note(desktop, uid).content == "Mine"
    assert server_note(client, uid)["content"] == "Theirs"
    with Session(desktop) as session:
        conflict = session.get(SyncConflict, uid)
        assert conflict is not None and conflict.their_content == "Theirs"

    assert sync_once(desktop, client).conflicts == 1
    assert server_note(client, uid)["content"] == "Theirs"

    assert resolve_conflict(desktop, uid, name="Shared", content="Mine")
    assert sync_once(desktop, client).conflicts == 0
    assert server_note(client, uid)["content"] == "Mine"
    assert local_note(desktop, uid).content == "Mine"


def test_taking_their_version_resolves_a_conflict(client, desktop):
    uid = add_note(desktop, "Shared", "Original")
    sync_once(desktop, client)
    edit_local(desktop, uid, content="Mine")
    client.patch(
        f"/api/notes/{server_id(uid)}", json={"name": "Shared", "content": "Theirs"}
    )
    sync_once(desktop, client)

    resolve_conflict(desktop, uid, name="Shared", content="Theirs")
    sync_once(desktop, client)
    assert local_note(desktop, uid).content == "Theirs"
    assert server_note(client, uid)["content"] == "Theirs"


def test_a_later_web_edit_updates_the_open_conflict(client, desktop):
    uid = add_note(desktop, "Shared", "Original")
    sync_once(desktop, client)
    edit_local(desktop, uid, content="Mine")
    client.patch(
        f"/api/notes/{server_id(uid)}", json={"name": "Shared", "content": "Theirs"}
    )
    sync_once(desktop, client)

    client.patch(
        f"/api/notes/{server_id(uid)}", json={"name": "Shared", "content": "Theirs v2"}
    )
    sync_once(desktop, client)
    with Session(desktop) as session:
        assert session.get(SyncConflict, uid).their_content == "Theirs v2"
    assert local_note(desktop, uid).content == "Mine"


def test_an_offline_review_merges_with_a_web_edit(client, desktop):
    uid = add_note(desktop, "Card", "Front")
    sync_once(desktop, client)

    review_local(desktop, uid, "good")
    client.patch(
        f"/api/notes/{server_id(uid)}", json={"name": "Card", "content": "Edited"}
    )
    outcome = sync_once(desktop, client)

    assert outcome.conflicts == 0
    on_server = server_note(client, uid)
    assert on_server["content"] == "Edited"
    assert [r["rating"] for r in on_server["reminders"] if r["rating"]] == ["good"]
    assert len(pending_reminders(on_server)) == 1
    assert local_note(desktop, uid).content == "Edited"


def test_reviewing_the_same_card_on_two_devices_keeps_one_schedule(
    client, tmp_path, desktop
):
    uid = add_note(desktop, "Card")
    sync_once(desktop, client)
    laptop = make_desktop(tmp_path, "laptop")
    sync_once(laptop, client)

    review_local(desktop, uid, "good")
    review_local(laptop, uid, "again")
    sync_once(desktop, client)
    sync_once(laptop, client)
    sync_once(desktop, client)

    on_server = server_note(client, uid)
    assert [r["rating"] for r in on_server["reminders"] if r["rating"]] == ["good"]
    assert len(pending_reminders(on_server)) == 1
    for engine in (desktop, laptop):
        note = local_note(engine, uid)
        assert [r.rating for r in note.reminders if r.rating] == ["good"]
        assert len([r for r in note.reminders if r.reviewed_at is None]) == 1


def test_trashing_on_the_desktop_trashes_on_the_server(client, desktop):
    uid = add_note(desktop, "Old")
    sync_once(desktop, client)
    edit_local(desktop, uid, deleted_at=utcnow())
    sync_once(desktop, client)
    trashed = client.get("/api/notes/list", params={"deleted": True}).json()["items"]
    assert [n["name"] for n in trashed] == ["Old"]


def test_deleting_forever_on_the_server_removes_the_desktop_copy(client, desktop):
    uid = add_note(desktop, "Gone")
    sync_once(desktop, client)
    note_id = server_id(uid)
    client.delete(f"/api/notes/{note_id}")
    client.delete(f"/api/notes/{note_id}/permanent")
    sync_once(desktop, client)
    assert local_note(desktop, uid) is None


def test_editing_a_note_the_web_trashed_brings_it_back(client, desktop):
    uid = add_note(desktop, "Keep me", "v1")
    sync_once(desktop, client)
    client.delete(f"/api/notes/{server_id(uid)}")
    edit_local(desktop, uid, content="v2")
    sync_once(desktop, client)
    on_server = client.get(f"/api/notes/{server_id(uid)}")
    assert on_server.status_code == 200
    assert on_server.json()["content"] == "v2"


def test_a_tag_created_on_both_sides_merges_into_one(client, desktop):
    client.post("/api/tags/create", json={"name": "python"})
    uid = add_note(desktop, "Typing", tags=("Python",))
    sync_once(desktop, client)

    names = [t["name"] for t in client.get("/api/tags/list").json()]
    assert names.count("python") == 1 and "Python" not in names
    assert "python" in [t["name"] for t in server_note(client, uid)["tags"]]
    with Session(desktop) as session:
        tags = session.exec(select(Tag).where(col(Tag.is_difficulty).is_(False))).all()
        assert [t.name for t in tags] == ["python"]


def test_a_new_desktop_adopts_the_servers_settings(client, desktop):
    client.patch("/api/settings", json={"default_algorithm": "sm2"})
    sync_once(desktop, client)
    with Session(desktop) as session:
        assert session.get(Settings, 1).default_algorithm == "sm2"


def test_a_project_deleted_on_the_server_unfiles_desktop_notes(client, desktop):
    uid = add_note(desktop, "Filed", project="Temp")
    sync_once(desktop, client)
    project_id = server_note(client, uid)["project"]["id"]
    client.delete(f"/api/projects/{project_id}")
    sync_once(desktop, client)
    note = local_note(desktop, uid)
    assert note.project is None
    with Session(desktop) as session:
        assert (
            session.exec(select(Project).where(Project.name == "Temp")).first() is None
        )


def test_pulled_changes_are_not_pushed_back(client, tmp_path, desktop):
    for i in range(3):
        client.post("/api/notes/create", json={"name": f"Web {i}", "content": "x"})
    sync_once(desktop, client)
    with Session(desktop) as session:
        assert len(session.exec(select(Note)).all()) == 3
        assert len(session.exec(select(Reminder)).all()) == 3
    assert sync_once(desktop, client).pushed == 0
