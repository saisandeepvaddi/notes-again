"""Notes CRUD, tags/project/difficulty edits, and the trash lifecycle."""

import datetime

from db.models import utcnow


def create(client, name="A note", **body) -> dict:
    response = client.post("/api/notes/create", json={"name": name, "content": "body", **body})
    assert response.status_code == 200, response.text
    return response.json()


def tag_id(client, name: str) -> int:
    tags = client.get("/api/tags/list").json()
    return next(t["id"] for t in tags if t["name"] == name)


# --- create -------------------------------------------------------------


def test_create_note_gets_a_medium_difficulty_tag_and_a_due_reminder_by_default(client):
    note = create(client)
    tags = [t["name"] for t in note["tags"]]
    assert tags == ["Medium"]
    assert note["ease_factor"] == 2.5  # Medium's default ease factor
    assert len(note["reminders"]) == 1
    assert note["reminders"][0]["reviewed_at"] is None
    remind_at = datetime.datetime.fromisoformat(note["reminders"][0]["remind_at"])
    assert remind_at <= datetime.datetime.now(datetime.UTC)


def test_create_note_applies_requested_difficulty_and_tags(client):
    rust = client.post("/api/tags/create", json={"name": "rust"}).json()
    note = create(client, difficulty="hard", tag_ids=[rust["id"]])
    names = sorted(t["name"] for t in note["tags"])
    assert names == ["Hard", "rust"]
    assert note["ease_factor"] == 1.8  # Hard's default ease factor


def test_create_note_difficulty_tag_ids_are_ignored_not_applied_twice(client):
    hard = tag_id(client, "Hard")
    # Passing a difficulty tag's id in tag_ids shouldn't double up or let it
    # override the `difficulty` field -- only apply_difficulty sets it.
    note = create(client, difficulty="easy", tag_ids=[hard])
    names = sorted(t["name"] for t in note["tags"])
    assert names == ["Easy"]


def test_create_note_attaches_to_a_project(client):
    project = client.post("/api/projects/create", json={"name": "Reading"}).json()
    note = create(client, project_id=project["id"])
    assert note["project"]["name"] == "Reading"


def test_create_note_with_unknown_project_404s(client):
    response = client.post("/api/notes/create", json={"name": "x", "content": "y", "project_id": 999})
    assert response.status_code == 404


# --- read / list ----------------------------------------------------------


def test_get_missing_note_404s(client):
    assert client.get("/api/notes/999").status_code == 404


def test_get_deleted_note_404s(client):
    note = create(client)
    client.delete(f"/api/notes/{note['id']}")
    assert client.get(f"/api/notes/{note['id']}").status_code == 404


def test_list_filters_by_tag_and_project(client):
    project = client.post("/api/projects/create", json={"name": "P"}).json()
    tag = client.post("/api/tags/create", json={"name": "t"}).json()
    in_both = create(client, "In both", project_id=project["id"], tag_ids=[tag["id"]])
    create(client, "In neither")

    by_project = client.get("/api/notes/list", params={"project_id": project["id"]}).json()
    assert [n["id"] for n in by_project["items"]] == [in_both["id"]]

    by_tag = client.get("/api/notes/list", params={"tag_id": tag["id"]}).json()
    assert [n["id"] for n in by_tag["items"]] == [in_both["id"]]


def test_list_search_matches_name_or_content(client):
    match = create(client, "Findable name", content="irrelevant")
    create(client, "Other", content="also irrelevant")
    match_by_content = create(client, "Unrelated name", content="a findable phrase here")

    found = client.get("/api/notes/list", params={"search": "findable"}).json()
    ids = {n["id"] for n in found["items"]}
    assert ids == {match["id"], match_by_content["id"]}


def test_list_excludes_deleted_notes_unless_asked(client):
    note = create(client)
    client.delete(f"/api/notes/{note['id']}")

    assert note["id"] not in [n["id"] for n in client.get("/api/notes/list").json()["items"]]
    trashed = client.get("/api/notes/list", params={"deleted": True}).json()
    assert note["id"] in [n["id"] for n in trashed["items"]]


# --- update -----------------------------------------------------------------


def test_update_note_changes_name_and_content(client):
    note = create(client, "Old name", content="old")
    response = client.patch(f"/api/notes/{note['id']}", json={"name": "New name", "content": "new"})
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "New name"
    assert updated["content"] == "new"

    refetched = client.get(f"/api/notes/{note['id']}").json()
    assert refetched["name"] == "New name"


def test_update_deleted_note_404s(client):
    note = create(client)
    client.delete(f"/api/notes/{note['id']}")
    response = client.patch(f"/api/notes/{note['id']}", json={"name": "x", "content": "y"})
    assert response.status_code == 404


# --- trash lifecycle ----------------------------------------------------


def test_delete_restore_and_permanently_delete(client):
    note = create(client)

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.get(f"/api/notes/{note['id']}").status_code == 404

    restored = client.patch(f"/api/notes/{note['id']}/restore")
    assert restored.status_code == 200
    assert client.get(f"/api/notes/{note['id']}").status_code == 200

    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.delete(f"/api/notes/{note['id']}/permanent").status_code == 204
    # Once gone for good, even restore can't bring it back.
    assert client.patch(f"/api/notes/{note['id']}/restore").status_code == 404


def test_restore_a_note_that_was_never_deleted_404s(client):
    note = create(client)
    assert client.patch(f"/api/notes/{note['id']}/restore").status_code == 404


def test_empty_trash_permanently_deletes_every_trashed_note_only(client):
    trashed = create(client, "Trashed")
    kept = create(client, "Kept")
    client.delete(f"/api/notes/{trashed['id']}")

    assert client.delete("/api/notes/trash").status_code == 204

    assert client.get(f"/api/notes/{trashed['id']}").status_code == 404
    assert client.get(f"/api/notes/{kept['id']}").status_code == 200


# --- tags ---------------------------------------------------------------


def test_attach_and_detach_a_regular_tag(client):
    note = create(client)
    tag = client.post("/api/tags/create", json={"name": "rust"}).json()

    attached = client.post(f"/api/notes/{note['id']}/tags/{tag['id']}")
    assert attached.status_code == 200
    assert "rust" in [t["name"] for t in attached.json()["tags"]]

    detached = client.delete(f"/api/notes/{note['id']}/tags/{tag['id']}")
    assert detached.status_code == 200
    assert "rust" not in [t["name"] for t in detached.json()["tags"]]


def test_attaching_a_difficulty_tag_directly_is_rejected(client):
    note = create(client)
    hard = tag_id(client, "Hard")
    response = client.post(f"/api/notes/{note['id']}/tags/{hard}")
    assert response.status_code == 400


def test_detaching_a_difficulty_tag_directly_is_rejected(client):
    note = create(client)  # created with Medium
    medium = tag_id(client, "Medium")
    response = client.delete(f"/api/notes/{note['id']}/tags/{medium}")
    assert response.status_code == 400


def test_attaching_the_same_tag_twice_is_a_no_op(client):
    note = create(client)
    tag = client.post("/api/tags/create", json={"name": "rust"}).json()
    client.post(f"/api/notes/{note['id']}/tags/{tag['id']}")
    second = client.post(f"/api/notes/{note['id']}/tags/{tag['id']}")
    assert [t["name"] for t in second.json()["tags"] if t["name"] == "rust"] == ["rust"]


# --- difficulty / project -------------------------------------------------


def test_set_difficulty_swaps_the_tag_and_syncs_ease_factor(client):
    note = create(client)  # Medium
    response = client.patch(f"/api/notes/{note['id']}/difficulty", json={"difficulty": "hard"})
    assert response.status_code == 200
    body = response.json()
    difficulty_tags = [t["name"] for t in body["tags"] if t["is_difficulty"]]
    assert difficulty_tags == ["Hard"]
    assert body["ease_factor"] == 1.8


def test_set_project_then_clear_it(client):
    note = create(client)
    project = client.post("/api/projects/create", json={"name": "P"}).json()

    with_project = client.patch(f"/api/notes/{note['id']}/project", json={"project_id": project["id"]})
    assert with_project.json()["project"]["name"] == "P"

    cleared = client.patch(f"/api/notes/{note['id']}/project", json={"project_id": None})
    assert cleared.json()["project"] is None


# --- rescheduling -----------------------------------------------------------


def test_reschedule_pending_reminder_moves_it(client):
    note = create(client)
    new_time = (utcnow() + datetime.timedelta(days=5)).isoformat()
    response = client.patch(
        f"/api/notes/{note['id']}/reminders/pending", json={"remind_at": new_time}
    )
    assert response.status_code == 200
    reminder = response.json()["reminders"][0]
    assert reminder["remind_at"][:16] == new_time[:16]


# --- due notes ----------------------------------------------------------


def test_due_notes_only_returns_notes_whose_reminder_is_due(client):
    due = create(client)  # first_reminder_at defaults to now
    not_due = create(client)
    future = (utcnow() + datetime.timedelta(days=30)).isoformat()
    client.patch(f"/api/notes/{not_due['id']}/reminders/pending", json={"remind_at": future})

    due_ids = {n["id"] for n in client.get("/api/notes/due").json()["items"]}
    assert due["id"] in due_ids
    assert not_due["id"] not in due_ids
