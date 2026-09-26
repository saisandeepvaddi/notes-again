"""Paused notes: kept as notes but left out of review, for single notes,
selections, projects, tags and imports -- and paced back in on resume."""

import datetime


def create_note(client, name="n", **body) -> dict:
    response = client.post(
        "/api/notes/create", json={"name": name, "content": "c", **body}
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_project(client, name="P") -> dict:
    return client.post("/api/projects/create", json={"name": name}).json()


def due_ids(client) -> set[int]:
    return {
        note["id"] for note in client.get("/api/notes/due?limit=200").json()["items"]
    }


def pending_at(note: dict) -> datetime.datetime:
    (pending,) = [r for r in note["reminders"] if r["reviewed_at"] is None]
    return datetime.datetime.fromisoformat(pending["remind_at"])


def review(client, note: dict) -> dict:
    (pending,) = [r for r in note["reminders"] if r["reviewed_at"] is None]
    response = client.patch(
        f"/api/notes/reminders/{pending['id']}/now",
        json={"action": "review", "rating": "good"},
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- single notes -----------------------------------------------------------


def test_a_paused_note_is_left_out_of_review_and_comes_back_on_resume(client):
    note = create_note(client)
    assert note["paused_at"] is None

    paused = client.patch(
        f"/api/notes/{note['id']}/paused", json={"paused": True}
    ).json()
    assert paused["paused_at"] is not None
    assert note["id"] not in due_ids(client)
    # still a note: readable and listed
    assert client.get(f"/api/notes/{note['id']}").status_code == 200

    resumed = client.patch(
        f"/api/notes/{note['id']}/paused", json={"paused": False}
    ).json()
    assert resumed["paused_at"] is None
    assert pending_at(resumed) == pending_at(note)  # schedule untouched
    assert note["id"] in due_ids(client)


def test_list_filters_by_paused_and_the_day_view_skips_paused_notes(client):
    active = create_note(client, "active")
    paused = create_note(client, "paused", paused=True)

    def listed(query: str) -> set[int]:
        return {n["id"] for n in client.get(f"/api/notes/list?{query}").json()["items"]}

    assert listed("") == {active["id"], paused["id"]}
    assert listed("paused=true") == {paused["id"]}
    assert listed("paused=false") == {active["id"]}

    now = datetime.datetime.now(datetime.UTC)
    day = {
        "start": (now - datetime.timedelta(hours=1)).isoformat(),
        "end": (now + datetime.timedelta(hours=1)).isoformat(),
    }
    response = client.get("/api/notes/list", params=day)
    assert {n["id"] for n in response.json()["items"]} == {active["id"]}


# --- paused by default in a paused project ----------------------------------


def test_new_notes_follow_the_projects_default_unless_told_otherwise(client):
    project = create_project(client)
    client.post(f"/api/projects/{project['id']}/pause")

    # no `paused` sent (e.g. the capture extension): the project's default
    assert create_note(client, "a", project_id=project["id"])["paused_at"] is not None
    # an explicit choice wins either way
    assert (
        create_note(client, "b", project_id=project["id"], paused=False)["paused_at"]
        is None
    )
    assert create_note(client, "c", paused=True)["paused_at"] is not None
    assert create_note(client, "d")["paused_at"] is None


# --- groups -----------------------------------------------------------------


def test_pausing_a_project_pauses_its_notes_and_sets_its_default(client):
    project = create_project(client)
    inside = create_note(client, "in", project_id=project["id"])
    outside = create_note(client, "out")

    assert client.post(f"/api/projects/{project['id']}/pause").json() == {"affected": 1}
    assert due_ids(client) == {outside["id"]}
    (listed,) = client.get("/api/projects/list").json()
    assert listed["paused"] is True
    assert listed["paused_count"] == 1

    result = client.post(
        f"/api/projects/{project['id']}/resume", json={"per_day": 0}
    ).json()
    assert result["affected"] == 1
    assert due_ids(client) == {inside["id"], outside["id"]}
    (listed,) = client.get("/api/projects/list").json()
    assert listed["paused"] is False
    assert listed["paused_count"] == 0


def test_pausing_a_tag_pauses_the_notes_carrying_it(client):
    tag = client.post("/api/tags/create", json={"name": "ref"}).json()
    tagged = create_note(client, "t", tag_ids=[tag["id"]])
    other = create_note(client, "o")

    assert client.post(f"/api/tags/{tag['id']}/pause").json() == {"affected": 1}
    assert due_ids(client) == {other["id"]}
    counts = {t["name"]: t["paused_count"] for t in client.get("/api/tags/list").json()}
    assert counts["ref"] == 1

    client.post(f"/api/tags/{tag['id']}/resume", json={"per_day": 0})
    assert due_ids(client) == {tagged["id"], other["id"]}


def test_unknown_project_or_tag_404s(client):
    assert client.post("/api/projects/999/pause").status_code == 404
    assert client.post("/api/tags/999/resume", json={}).status_code == 404


def test_bulk_pause_and_resume(client):
    a, b = create_note(client, "a"), create_note(client, "b")

    response = client.post(
        "/api/notes/bulk/pause", json={"note_ids": [a["id"], b["id"], 999]}
    )
    assert response.json() == {"affected": 2}
    assert due_ids(client) == set()
    # already paused: nothing to do
    assert client.post(
        "/api/notes/bulk/pause", json={"note_ids": [a["id"]]}
    ).json() == {"affected": 0}

    result = client.post(
        "/api/notes/bulk/resume", json={"note_ids": [a["id"]], "per_day": 0}
    ).json()
    assert result == {"affected": 1, "due_today": 1, "days_span": 0}
    assert due_ids(client) == {a["id"]}


# --- pacing on resume -------------------------------------------------------


def test_resume_paces_never_reviewed_due_notes_per_day(client):
    ids = [create_note(client, f"n{i}", paused=True)["id"] for i in range(5)]

    result = client.post(
        "/api/notes/bulk/resume", json={"note_ids": ids, "per_day": 2}
    ).json()
    assert result == {"affected": 5, "due_today": 2, "days_span": 3}
    # in the order they were due: the first two now, the rest on later days
    assert due_ids(client) == set(ids[:2])


def test_resume_keeps_the_schedule_of_notes_with_review_history(client):
    note = create_note(client)
    reviewed = review(client, note)  # next review is days away now
    client.post("/api/notes/bulk/pause", json={"note_ids": [note["id"]]})

    result = client.post(
        "/api/notes/bulk/resume", json={"note_ids": [note["id"]], "per_day": 1}
    ).json()
    assert result == {"affected": 1, "due_today": 0, "days_span": 0}
    after = client.get(f"/api/notes/{note['id']}").json()
    assert pending_at(after) == pending_at(reviewed)


# --- import ------------------------------------------------------------------


def test_a_paused_import_creates_paused_notes_and_paused_new_decks(client):
    payload = {
        "decks": [
            {
                "name": "Later",
                "notes": [{"name": f"n{i}", "content": "c"} for i in range(3)],
            }
        ]
    }
    response = client.post(
        "/api/import/notes", json={"payload": payload, "paused": True, "per_day": 1}
    )
    result = response.json()
    assert result["notes_created"] == 3
    assert result["paused"] is True
    assert result["due_today"] == 0
    assert due_ids(client) == set()

    (deck,) = client.get("/api/projects/list").json()
    assert deck["paused"] is True
    assert deck["paused_count"] == 3
