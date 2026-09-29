import datetime
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi.testclient import TestClient

from main import app


def create(client, name, **body) -> dict:
    response = client.post(
        "/api/notes/create", json={"name": name, "content": "body", **body}
    )
    assert response.status_code == 200, response.text
    return response.json()


def review(client, note: dict, rating: str) -> dict:
    pending = next(r for r in note["reminders"] if r["reviewed_at"] is None)
    response = client.patch(
        f"/api/notes/reminders/{pending['id']}/now",
        json={"action": "review", "rating": rating},
    )
    assert response.status_code == 200, response.text
    return response.json()


def export(client, **options) -> dict:
    response = client.post("/api/export/notes", json=options)
    assert response.status_code == 200, response.text
    return response.json()


def count(client, **options) -> dict:
    response = client.post("/api/export/count", json=options)
    assert response.status_code == 200, response.text
    return response.json()


def names(data: dict) -> set[str]:
    return {n["name"] for deck in data["decks"] for n in deck["notes"]} | {
        n["name"] for n in data["notes"]
    }


def import_payload(client, payload, **body) -> dict:
    response = client.post("/api/import/notes", json={"payload": payload, **body})
    assert response.status_code == 200, response.text
    return response.json()


@contextmanager
def fresh_client(tmp_path, monkeypatch, name: str) -> Iterator[TestClient]:
    monkeypatch.setenv("DB_PATH", str(tmp_path / f"{name}.db"))
    with TestClient(app) as other:
        yield other


def seed_library(client) -> None:
    project = client.post("/api/projects/create", json={"name": "Leetcode"}).json()
    tag = client.post("/api/tags/create", json={"name": "dsa"}).json()
    reviewed = create(
        client,
        "Two sum",
        project_id=project["id"],
        tag_ids=[tag["id"]],
        difficulty="hard",
    )
    reviewed = review(client, reviewed, "good")
    review(client, reviewed, "hard")
    create(client, "Loose note", difficulty="easy")
    paused = create(client, "Parked", paused=True)
    assert paused["paused_at"] is not None
    client.patch("/api/settings", json={"default_algorithm": "sm2"})
    sm2 = review(client, create(client, "Old style"), "easy")
    assert sm2["algorithm"] == "sm2"


def test_export_carries_decks_notes_and_review_state(client):
    seed_library(client)
    data = export(client)

    assert data["format"] == "notes-again"
    assert data["version"] == 1
    [deck] = data["decks"]
    assert deck["name"] == "Leetcode"
    [note] = deck["notes"]
    assert note["name"] == "Two sum"
    assert note["tags"] == ["dsa"]
    assert note["difficulty"] == "hard"
    assert note["review"]["algorithm"] == "fsrs"
    assert isinstance(note["review"]["fsrs_card"], dict)
    assert [h["rating"] for h in note["review"]["history"]] == ["good", "hard"]
    assert note["review"]["due_at"] is not None

    loose = {n["name"]: n for n in data["notes"]}
    assert loose["Parked"]["review"]["paused"] is True
    assert loose["Old style"]["review"]["algorithm"] == "sm2"
    assert loose["Old style"]["review"]["interval_days"] >= 1


def test_export_leaves_out_trashed_notes(client):
    create(client, "Keep")
    gone = create(client, "Gone")
    client.delete(f"/api/notes/{gone['id']}")

    names = [n["name"] for n in export(client)["notes"]]
    assert names == ["Keep"]


def test_export_then_import_into_an_empty_library_is_lossless(
    client, tmp_path, monkeypatch
):
    seed_library(client)
    original = export(client)

    with fresh_client(tmp_path, monkeypatch, "restored") as restored:
        result = import_payload(restored, original, per_day=1)
        assert result["notes_created"] == 4
        assert result["restored_reviews"] == 4
        again = export(restored)

    assert again["decks"] == original["decks"]
    assert sorted(again["notes"], key=lambda n: n["name"]) == sorted(
        original["notes"], key=lambda n: n["name"]
    )


def test_undo_still_works_on_an_imported_review(client, tmp_path, monkeypatch):
    note = review(client, create(client, "Two sum"), "good")
    original = export(client)
    due_before_review = next(r for r in note["reminders"] if r["reviewed_at"])[
        "remind_at"
    ]

    with fresh_client(tmp_path, monkeypatch, "restored") as restored:
        import_payload(restored, original)
        [imported] = restored.get("/api/notes/list").json()["items"]
        reviewed = next(
            r for r in imported["reminders"] if r["reviewed_at"] is not None
        )
        undone = restored.patch(
            f"/api/notes/reminders/{reviewed['id']}/now", json={"action": "undo_review"}
        )
        assert undone.status_code == 200, undone.text
        [pending] = undone.json()["reminders"]
        assert pending["reviewed_at"] is None
        assert pending["remind_at"] == due_before_review


def test_restored_notes_keep_their_due_dates_instead_of_being_paced(client):
    later = (
        datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=9)
    ).isoformat()
    payload = {
        "notes": [
            {
                "name": "Scheduled",
                "review": {"algorithm": "sm2", "interval_days": 6, "due_at": later},
            },
            {"name": "Fresh 1"},
            {"name": "Fresh 2"},
        ]
    }
    result = import_payload(client, payload, per_day=1)
    assert result["restored_reviews"] == 1
    assert result["due_today"] == 1

    notes = {n["name"]: n for n in client.get("/api/notes/list").json()["items"]}
    scheduled = notes["Scheduled"]
    assert scheduled["interval_days"] == 6
    assert datetime.datetime.fromisoformat(scheduled["reminders"][0]["remind_at"]) == (
        datetime.datetime.fromisoformat(later)
    )


def test_an_invalid_review_block_skips_the_note_with_a_reason(client):
    payload = {
        "notes": [
            {"name": "Bad algorithm", "review": {"algorithm": "anki"}},
            {
                "name": "Bad card",
                "review": {"algorithm": "fsrs", "fsrs_card": {"nope": 1}},
            },
            {
                "name": "Bad rating",
                "review": {
                    "algorithm": "sm2",
                    "history": [
                        {"reviewed_at": "2026-01-01T00:00:00Z", "rating": "meh"}
                    ],
                },
            },
            {"name": "Fine"},
        ]
    }
    result = import_payload(client, payload, dry_run=True)
    assert result["notes_created"] == 1
    assert result["invalid_skipped"] == 3
    assert [issue["name"] for issue in result["issues"]] == [
        "Bad algorithm",
        "Bad card",
        "Bad rating",
    ]


def test_a_paused_deck_round_trips(client, tmp_path, monkeypatch):
    project = client.post("/api/projects/create", json={"name": "Later"}).json()
    create(client, "Someday", project_id=project["id"])
    client.post(f"/api/projects/{project['id']}/pause")
    original = export(client)
    assert original["decks"][0]["paused"] is True

    with fresh_client(tmp_path, monkeypatch, "restored") as restored:
        import_payload(restored, original)
        [deck] = [
            p for p in restored.get("/api/projects/list").json() if p["name"] == "Later"
        ]
        assert deck["paused"] is True


def test_export_is_offered_as_a_file_download(client):
    response = client.post("/api/export/notes", json={})
    assert response.headers["content-disposition"].startswith("attachment; filename=")


def filter_library(client) -> dict:
    leetcode = client.post("/api/projects/create", json={"name": "Leetcode"}).json()
    reading = client.post("/api/projects/create", json={"name": "Reading"}).json()
    dsa = client.post("/api/tags/create", json={"name": "dsa"}).json()
    graphs = client.post("/api/tags/create", json={"name": "graphs"}).json()
    create(client, "Two sum", project_id=leetcode["id"], tag_ids=[dsa["id"]])
    create(
        client, "Dijkstra", project_id=leetcode["id"], tag_ids=[dsa["id"], graphs["id"]]
    )
    create(client, "Book notes", project_id=reading["id"])
    create(client, "Loose graph", tag_ids=[graphs["id"]])
    create(client, "Loose", paused=True)
    return {
        "leetcode": leetcode["id"],
        "reading": reading["id"],
        "dsa": dsa["id"],
        "graphs": graphs["id"],
    }


def test_export_can_be_limited_to_projects(client):
    ids = filter_library(client)
    data = export(client, project_ids=[ids["reading"]])
    assert names(data) == {"Book notes"}
    assert [d["name"] for d in data["decks"]] == ["Reading"]


def test_no_project_can_be_chosen_alongside_projects(client):
    ids = filter_library(client)
    data = export(client, project_ids=[ids["reading"]], include_no_project=True)
    assert names(data) == {"Book notes", "Loose graph", "Loose"}


def test_tags_match_any_and_combine_with_projects(client):
    ids = filter_library(client)
    assert names(export(client, tag_ids=[ids["graphs"]])) == {"Dijkstra", "Loose graph"}
    assert names(export(client, tag_ids=[ids["dsa"], ids["graphs"]])) == {
        "Two sum",
        "Dijkstra",
        "Loose graph",
    }
    assert names(
        export(client, project_ids=[ids["leetcode"]], tag_ids=[ids["graphs"]])
    ) == {"Dijkstra"}


def test_specific_notes_can_be_exported(client):
    filter_library(client)
    listed = {n["name"]: n["id"] for n in client.get("/api/notes/list").json()["items"]}
    data = export(client, note_ids=[listed["Two sum"], listed["Loose"]])
    assert names(data) == {"Two sum", "Loose"}


def test_paused_notes_can_be_left_out(client):
    filter_library(client)
    assert "Loose" not in names(export(client, include_paused=False))


def test_export_without_review_progress_imports_as_fresh_notes(
    client, tmp_path, monkeypatch
):
    review(client, create(client, "Studied"), "good")
    data = export(client, include_review=False)
    [note] = data["notes"]
    assert "review" not in note

    with fresh_client(tmp_path, monkeypatch, "shared") as other:
        result = import_payload(other, data)
        assert result["restored_reviews"] == 0
        [imported] = other.get("/api/notes/list").json()["items"]
        assert [r["reviewed_at"] for r in imported["reminders"]] == [None]


def test_count_matches_what_the_export_contains(client):
    ids = filter_library(client)
    assert count(client) == {"notes": 5, "decks": 2}
    assert count(client, tag_ids=[ids["graphs"]]) == {"notes": 2, "decks": 1}
    assert count(client, project_ids=[ids["reading"]], tag_ids=[ids["dsa"]]) == {
        "notes": 0,
        "decks": 0,
    }
