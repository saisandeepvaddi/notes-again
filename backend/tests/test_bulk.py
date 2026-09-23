"""Bulk note operations: same effect as the single-note endpoints, applied to
a whole selection, skipping ids that don't (or no longer) apply."""

import datetime

from db.models import utcnow


def create_note(client, name="n", **body) -> dict:
    response = client.post("/api/notes/create", json={"name": name, "content": "c", **body})
    assert response.status_code == 200, response.text
    return response.json()


def two_notes(client) -> tuple[dict, dict]:
    return create_note(client, "A"), create_note(client, "B")


# --- delete / restore / permanent -----------------------------------------


def test_bulk_delete_trashes_the_given_notes_and_skips_the_rest(client):
    a, b = two_notes(client)
    response = client.post("/api/notes/bulk/delete", json={"note_ids": [a["id"], 999]})
    assert response.status_code == 200
    assert response.json() == {"affected": 1}
    assert client.get(f"/api/notes/{a['id']}").status_code == 404
    assert client.get(f"/api/notes/{b['id']}").status_code == 200


def test_bulk_delete_ignores_duplicate_ids(client):
    a, _ = two_notes(client)
    response = client.post("/api/notes/bulk/delete", json={"note_ids": [a["id"], a["id"]]})
    assert response.json() == {"affected": 1}


def test_bulk_restore_only_restores_trashed_notes(client):
    a, b = two_notes(client)
    client.delete(f"/api/notes/{a['id']}")

    response = client.post("/api/notes/bulk/restore", json={"note_ids": [a["id"], b["id"]]})
    assert response.json() == {"affected": 1}  # b was never trashed
    assert client.get(f"/api/notes/{a['id']}").status_code == 200


def test_bulk_permanent_delete_only_touches_already_trashed_notes(client):
    a, b = two_notes(client)
    client.delete(f"/api/notes/{a['id']}")

    response = client.post(
        "/api/notes/bulk/permanent", json={"note_ids": [a["id"], b["id"]]}
    )
    assert response.json() == {"affected": 1}
    # b was live, so it's untouched, not destroyed.
    assert client.get(f"/api/notes/{b['id']}").status_code == 200


def test_bulk_too_many_ids_400s(client):
    response = client.post("/api/notes/bulk/delete", json={"note_ids": list(range(10_001))})
    assert response.status_code == 400


# --- project / tags / difficulty -------------------------------------------


def test_bulk_set_project_moves_every_note(client):
    a, b = two_notes(client)
    project = client.post("/api/projects/create", json={"name": "P"}).json()

    response = client.post(
        "/api/notes/bulk/project", json={"note_ids": [a["id"], b["id"]], "project_id": project["id"]}
    )
    assert response.json() == {"affected": 2}
    for note_id in (a["id"], b["id"]):
        assert client.get(f"/api/notes/{note_id}").json()["project"]["id"] == project["id"]


def test_bulk_set_project_with_unknown_id_404s(client):
    a, _ = two_notes(client)
    response = client.post(
        "/api/notes/bulk/project", json={"note_ids": [a["id"]], "project_id": 999}
    )
    assert response.status_code == 404


def test_bulk_add_and_remove_tags(client):
    a, b = two_notes(client)
    tag = client.post("/api/tags/create", json={"name": "rust"}).json()

    added = client.post(
        "/api/notes/bulk/tags", json={"note_ids": [a["id"], b["id"]], "add_tag_ids": [tag["id"]]}
    )
    assert added.json() == {"affected": 2}
    assert "rust" in [t["name"] for t in client.get(f"/api/notes/{a['id']}").json()["tags"]]

    removed = client.post(
        "/api/notes/bulk/tags", json={"note_ids": [a["id"]], "remove_tag_ids": [tag["id"]]}
    )
    assert removed.json() == {"affected": 1}
    assert "rust" not in [t["name"] for t in client.get(f"/api/notes/{a['id']}").json()["tags"]]
    # b was untouched by the removal.
    assert "rust" in [t["name"] for t in client.get(f"/api/notes/{b['id']}").json()["tags"]]


def test_bulk_tags_rejects_difficulty_tags(client):
    a, _ = two_notes(client)
    tags = {t["name"]: t["id"] for t in client.get("/api/tags/list").json()}
    response = client.post(
        "/api/notes/bulk/tags", json={"note_ids": [a["id"]], "add_tag_ids": [tags["Hard"]]}
    )
    assert response.status_code == 400


def test_bulk_add_tag_is_idempotent(client):
    a, _ = two_notes(client)
    tag = client.post("/api/tags/create", json={"name": "rust"}).json()
    client.post("/api/notes/bulk/tags", json={"note_ids": [a["id"]], "add_tag_ids": [tag["id"]]})
    second = client.post(
        "/api/notes/bulk/tags", json={"note_ids": [a["id"]], "add_tag_ids": [tag["id"]]}
    )
    assert second.json() == {"affected": 1}
    tag_names = [t["name"] for t in client.get(f"/api/notes/{a['id']}").json()["tags"]]
    assert tag_names.count("rust") == 1


def test_bulk_set_difficulty_swaps_the_tag_and_ease_factor(client):
    a, b = two_notes(client)  # both start Medium
    response = client.post(
        "/api/notes/bulk/difficulty", json={"note_ids": [a["id"], b["id"]], "difficulty": "easy"}
    )
    assert response.json() == {"affected": 2}
    for note_id in (a["id"], b["id"]):
        note = client.get(f"/api/notes/{note_id}").json()
        assert [t["name"] for t in note["tags"] if t["is_difficulty"]] == ["Easy"]
        assert note["ease_factor"] == 2.8


# --- reschedule -------------------------------------------------------------


def test_bulk_reschedule_moves_pending_reminders_only(client):
    a, b = two_notes(client)
    new_time = utcnow() + datetime.timedelta(days=10)

    response = client.post(
        "/api/notes/bulk/reschedule",
        json={"note_ids": [a["id"], b["id"]], "remind_at": new_time.isoformat()},
    )
    assert response.json() == {"affected": 2}

    for note_id in (a["id"], b["id"]):
        reminder = client.get(f"/api/notes/{note_id}").json()["reminders"][0]
        remind_at = datetime.datetime.fromisoformat(reminder["remind_at"])
        assert abs((remind_at - new_time).total_seconds()) < 1


def test_bulk_reschedule_skips_trashed_notes(client):
    a, _ = two_notes(client)
    client.delete(f"/api/notes/{a['id']}")
    new_time = (utcnow() + datetime.timedelta(days=10)).isoformat()

    response = client.post(
        "/api/notes/bulk/reschedule", json={"note_ids": [a["id"]], "remind_at": new_time}
    )
    assert response.json() == {"affected": 0}
