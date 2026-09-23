"""Projects and tags: creation (case-insensitive dedupe), listing with note
counts, and deletion (keep-notes vs. delete-notes-too, orphan tag cleanup)."""


def create_note(client, name="n", **body) -> dict:
    response = client.post("/api/notes/create", json={"name": name, "content": "c", **body})
    assert response.status_code == 200, response.text
    return response.json()


# --- projects -------------------------------------------------------------


def test_create_project(client):
    response = client.post("/api/projects/create", json={"name": "Reading"})
    assert response.status_code == 200
    assert response.json()["name"] == "Reading"


def test_creating_a_project_twice_case_insensitively_returns_the_same_one(client):
    first = client.post("/api/projects/create", json={"name": "Reading"}).json()
    second = client.post("/api/projects/create", json={"name": "  reading  "}).json()
    assert second["id"] == first["id"]
    assert len(client.get("/api/projects/list").json()) == 1


def test_creating_a_blank_project_400s(client):
    assert client.post("/api/projects/create", json={"name": "   "}).status_code == 400


def test_project_list_reports_only_live_note_counts(client):
    project = client.post("/api/projects/create", json={"name": "P"}).json()
    live = create_note(client, "live", project_id=project["id"])
    trashed = create_note(client, "trashed", project_id=project["id"])
    client.delete(f"/api/notes/{trashed['id']}")

    listed = client.get("/api/projects/list").json()
    assert next(p for p in listed if p["id"] == project["id"])["note_count"] == 1
    # sanity: the live note is really the one counted
    assert client.get(f"/api/notes/{live['id']}").json()["project"]["id"] == project["id"]


def test_deleting_a_project_keeps_its_notes_by_default(client):
    project = client.post("/api/projects/create", json={"name": "P"}).json()
    note = create_note(client, project_id=project["id"])

    response = client.delete(f"/api/projects/{project['id']}")
    assert response.status_code == 200
    assert response.json() == {"notes_trashed": 0, "notes_kept": 1, "tags_deleted": 0}

    kept = client.get(f"/api/notes/{note['id']}").json()
    assert kept["project"] is None


def test_deleting_a_project_can_trash_its_notes_too(client):
    project = client.post("/api/projects/create", json={"name": "P"}).json()
    note = create_note(client, project_id=project["id"])

    response = client.delete(f"/api/projects/{project['id']}", params={"delete_notes": True})
    assert response.json() == {"notes_trashed": 1, "notes_kept": 0, "tags_deleted": 0}
    assert client.get(f"/api/notes/{note['id']}").status_code == 404


def test_deleting_a_project_with_notes_can_also_delete_their_orphan_tags(client):
    project = client.post("/api/projects/create", json={"name": "P"}).json()
    only_here = client.post("/api/tags/create", json={"name": "only-here"}).json()
    elsewhere = client.post("/api/tags/create", json={"name": "elsewhere"}).json()
    create_note(client, project_id=project["id"], tag_ids=[only_here["id"], elsewhere["id"]])
    create_note(client, "outside", tag_ids=[elsewhere["id"]])

    response = client.delete(
        f"/api/projects/{project['id']}",
        params={"delete_notes": True, "delete_orphan_tags": True},
    )
    assert response.json()["tags_deleted"] == 1

    tag_names = {t["name"] for t in client.get("/api/tags/list").json()}
    assert "only-here" not in tag_names
    assert "elsewhere" in tag_names


def test_deleting_a_missing_project_404s(client):
    assert client.delete("/api/projects/999").status_code == 404


# --- tags -----------------------------------------------------------------


def test_create_tag(client):
    response = client.post("/api/tags/create", json={"name": "rust"})
    assert response.status_code == 200
    assert response.json()["name"] == "rust"
    assert response.json()["is_difficulty"] is False


def test_creating_a_tag_twice_case_insensitively_returns_the_same_one(client):
    first = client.post("/api/tags/create", json={"name": "rust"}).json()
    second = client.post("/api/tags/create", json={"name": "Rust"}).json()
    assert second["id"] == first["id"]


def test_creating_a_blank_tag_400s(client):
    assert client.post("/api/tags/create", json={"name": ""}).status_code == 400


def test_tag_list_includes_the_seeded_difficulty_tags(client):
    names = {(t["name"], t["is_difficulty"]) for t in client.get("/api/tags/list").json()}
    assert ("Easy", True) in names
    assert ("Medium", True) in names
    assert ("Hard", True) in names


def test_deleting_a_tag_removes_it_from_notes_but_keeps_them_by_default(client):
    tag = client.post("/api/tags/create", json={"name": "rust"}).json()
    note = create_note(client, tag_ids=[tag["id"]])

    response = client.delete(f"/api/tags/{tag['id']}")
    assert response.json() == {"notes_trashed": 0, "notes_kept": 1, "tags_deleted": 0}

    remaining = client.get(f"/api/notes/{note['id']}").json()
    assert "rust" not in [t["name"] for t in remaining["tags"]]


def test_deleting_a_tag_can_trash_its_notes_too(client):
    tag = client.post("/api/tags/create", json={"name": "rust"}).json()
    note = create_note(client, tag_ids=[tag["id"]])

    response = client.delete(f"/api/tags/{tag['id']}", params={"delete_notes": True})
    assert response.json()["notes_trashed"] == 1
    assert client.get(f"/api/notes/{note['id']}").status_code == 404


def test_difficulty_tags_cannot_be_deleted(client):
    tags = {t["name"]: t["id"] for t in client.get("/api/tags/list").json()}
    assert client.delete(f"/api/tags/{tags['Medium']}").status_code == 400


def test_deleting_a_missing_tag_404s(client):
    assert client.delete("/api/tags/999").status_code == 404


def test_delete_unused_tags_removes_only_tags_no_live_note_carries(client):
    client.post("/api/tags/create", json={"name": "unused"})
    used = client.post("/api/tags/create", json={"name": "used"}).json()
    create_note(client, tag_ids=[used["id"]])

    response = client.delete("/api/tags/unused")
    assert response.status_code == 200
    assert response.json()["tags_deleted"] == 1

    names = {t["name"] for t in client.get("/api/tags/list").json()}
    assert "unused" not in names
    assert "used" in names
    # Difficulty tags are never "unused" even with zero notes yet.
    assert {"Easy", "Medium", "Hard"} <= names
