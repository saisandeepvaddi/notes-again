from tests.test_pausing import create_note, create_project, due_ids, pending_at, review


def pending(note: dict) -> list[dict]:
    return [r for r in note["reminders"] if r["reviewed_at"] is None]


def set_status(client, note: dict, status: str) -> dict:
    response = client.patch(f"/api/notes/{note['id']}/status", json={"status": status})
    assert response.status_code == 200, response.text
    return response.json()


def listed(client, query: str) -> set[int]:
    return {n["id"] for n in client.get(f"/api/notes/list?{query}").json()["items"]}


def test_a_note_only_note_has_no_schedule_and_is_never_due(client):
    note = create_note(client, in_review=False)
    assert note["in_review"] is False
    assert note["paused_at"] is None
    assert note["reminders"] == []
    assert note["id"] not in due_ids(client)


def test_note_only_ignores_paused_and_the_projects_paused_default(client):
    project = create_project(client)
    client.post(f"/api/projects/{project['id']}/pause")
    note = create_note(client, project_id=project["id"], paused=True, in_review=False)
    assert note["in_review"] is False
    assert note["paused_at"] is None


def test_status_filter_separates_active_paused_and_note_only(client):
    active = create_note(client, "active")
    paused = create_note(client, "paused", paused=True)
    note_only = create_note(client, "note-only", in_review=False)

    assert listed(client, "") == {active["id"], paused["id"], note_only["id"]}
    assert listed(client, "status=active") == {active["id"]}
    assert listed(client, "status=paused") == {paused["id"]}
    assert listed(client, "status=note-only") == {note_only["id"]}


def test_converting_between_all_three_states(client):
    note = create_note(client)

    paused = set_status(client, note, "paused")
    assert paused["paused_at"] is not None

    note_only = set_status(client, paused, "note-only")
    assert note_only["in_review"] is False
    assert note_only["paused_at"] is None
    assert pending(note_only) == []

    back_paused = set_status(client, note_only, "paused")
    assert back_paused["in_review"] is True
    assert back_paused["paused_at"] is not None
    assert len(pending(back_paused)) == 1
    assert note["id"] not in due_ids(client)

    active = set_status(client, back_paused, "active")
    assert active["paused_at"] is None
    assert note["id"] in due_ids(client)


def test_removing_from_review_keeps_history_and_adding_back_continues_from_it(client):
    note = create_note(client)
    reviewed = review(client, note)
    assert len(reviewed["reminders"]) == 2

    note_only = set_status(client, reviewed, "note-only")
    assert [r["rating"] for r in note_only["reminders"]] == ["good"]

    back = set_status(client, note_only, "active")
    assert len(back["reminders"]) == 2
    assert pending_at(back) < pending_at(reviewed)
    assert note["id"] in due_ids(client)


def test_a_note_only_note_cannot_be_reviewed_or_have_its_review_undone(client):
    note = create_note(client)
    reviewed = review(client, note)
    (past,) = [r for r in reviewed["reminders"] if r["reviewed_at"] is not None]
    set_status(client, reviewed, "note-only")

    undo = client.patch(
        f"/api/notes/reminders/{past['id']}/now", json={"action": "undo_review"}
    )
    assert undo.status_code == 400
    again = client.patch(
        f"/api/notes/reminders/{past['id']}/now",
        json={"action": "review", "rating": "good"},
    )
    assert again.status_code == 400


def test_pausing_skips_note_only_notes(client):
    note = create_note(client, in_review=False)
    assert client.post(
        "/api/notes/bulk/pause", json={"note_ids": [note["id"]]}
    ).json() == {"affected": 0}

    paused = client.patch(
        f"/api/notes/{note['id']}/paused", json={"paused": True}
    ).json()
    assert paused["in_review"] is True
    assert paused["paused_at"] is not None


def test_bulk_remove_and_add_back_paced_per_day(client):
    ids = [create_note(client, f"n{i}")["id"] for i in range(5)]

    removed = client.post("/api/notes/bulk/remove-from-review", json={"note_ids": ids})
    assert removed.json() == {"affected": 5}
    assert due_ids(client) == set()

    result = client.post(
        "/api/notes/bulk/add-to-review", json={"note_ids": ids, "per_day": 2}
    ).json()
    assert result == {"affected": 5, "due_today": 2, "days_span": 3}
    assert due_ids(client) == set(ids[:2])


def test_bulk_add_to_review_as_paused(client):
    ids = [create_note(client, f"n{i}", in_review=False)["id"] for i in range(2)]
    result = client.post(
        "/api/notes/bulk/add-to-review",
        json={"note_ids": ids, "paused": True, "per_day": 1},
    ).json()
    assert result == {"affected": 2, "due_today": 0, "days_span": 0}
    assert listed(client, "status=paused") == set(ids)


def test_project_and_tag_counts_and_conversions(client):
    project = create_project(client)
    tag = client.post("/api/tags/create", json={"name": "ref"}).json()
    a = create_note(client, "a", project_id=project["id"], tag_ids=[tag["id"]])
    create_note(client, "b", project_id=project["id"], in_review=False)

    (listed_project,) = client.get("/api/projects/list").json()
    assert listed_project["note_only_count"] == 1

    assert client.post(f"/api/tags/{tag['id']}/remove-from-review").json() == {
        "affected": 1
    }
    counts = {
        t["name"]: t["note_only_count"] for t in client.get("/api/tags/list").json()
    }
    assert counts["ref"] == 1

    result = client.post(
        f"/api/projects/{project['id']}/add-to-review", json={"per_day": 0}
    ).json()
    assert result["affected"] == 2
    assert a["id"] in due_ids(client)
    (listed_project,) = client.get("/api/projects/list").json()
    assert listed_project["note_only_count"] == 0

    assert client.post(f"/api/projects/{project['id']}/remove-from-review").json() == {
        "affected": 2
    }


def test_a_note_only_import_creates_unscheduled_notes(client):
    payload = {
        "decks": [{"name": "Ref", "notes": [{"name": f"n{i}"} for i in range(3)]}]
    }
    result = client.post(
        "/api/import/notes",
        json={"payload": payload, "in_review": False, "paused": True},
    ).json()
    assert result["notes_created"] == 3
    assert result["note_only"] is True
    assert result["paused"] is False
    assert result["first_due"] is None
    assert result["due_today"] == 0

    (deck,) = client.get("/api/projects/list").json()
    assert deck["paused"] is False
    assert deck["note_only_count"] == 3


def test_note_only_survives_an_export_and_import_round_trip(client):
    note = create_note(client, "kept")
    review(client, note)
    set_status(client, note, "note-only")
    create_note(client, "studied")

    exported = client.post("/api/export/notes", json={}).json()
    by_name = {n["name"]: n for n in exported["notes"]}
    assert by_name["kept"]["review"]["in_review"] is False
    assert by_name["kept"]["review"]["due_at"] is None

    for item in exported["notes"]:
        item["name"] += " copy"
    result = client.post("/api/import/notes", json={"payload": exported}).json()
    assert result["notes_created"] == 2

    (copy,) = client.get("/api/notes/list?status=note-only&search=kept copy").json()[
        "items"
    ]
    assert [r["rating"] for r in copy["reminders"]] == ["good"]
