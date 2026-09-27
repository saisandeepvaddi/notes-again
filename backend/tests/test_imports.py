def import_notes(client, payload, *, dry_run=False, **body):
    response = client.post(
        "/api/import/notes", json={"payload": payload, "dry_run": dry_run, **body}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_dry_run_reports_what_would_happen_without_writing_anything(client):
    payload = {"notes": [{"name": "A loose note", "content": "body"}]}
    result = import_notes(client, payload, dry_run=True)

    assert result["dry_run"] is True
    assert result["notes_created"] == 1
    assert client.get("/api/notes/list").json()["total"] == 0


def test_committing_actually_creates_the_notes(client):
    payload = {"notes": [{"name": "A loose note", "content": "body"}]}
    result = import_notes(client, payload, dry_run=False)

    assert result["dry_run"] is False
    assert result["notes_created"] == 1
    listed = client.get("/api/notes/list").json()
    assert listed["total"] == 1
    assert listed["items"][0]["name"] == "A loose note"


def test_dry_run_and_commit_report_identical_numbers(client):
    payload = {
        "decks": [{"name": "Deck", "notes": [{"name": "n1", "content": "c"}]}],
        "notes": [{"name": "n2", "content": "c"}],
    }
    preview = import_notes(client, payload, dry_run=True)
    real = import_notes(client, payload, dry_run=False)

    for key in ("notes_created", "new_decks", "new_tags", "duplicates_skipped", "invalid_skipped"):
        assert preview[key] == real[key]


def test_import_creates_decks_and_tags_named_in_the_file(client):
    payload = {
        "decks": [
            {
                "name": "Leetcode",
                "notes": [{"name": "Two sum", "content": "c", "tags": ["dsa"], "difficulty": "hard"}],
            }
        ]
    }
    result = import_notes(client, payload)
    assert result["new_decks"] == 1
    assert result["new_tags"] == 1

    projects = {p["name"] for p in client.get("/api/projects/list").json()}
    assert "Leetcode" in projects
    note = client.get("/api/notes/list").json()["items"][0]
    assert note["project"]["name"] == "Leetcode"
    tag_names = {t["name"] for t in note["tags"]}
    assert tag_names == {"dsa", "Hard"}


def test_import_matches_existing_decks_and_tags_case_insensitively(client):
    client.post("/api/projects/create", json={"name": "Leetcode"})
    client.post("/api/tags/create", json={"name": "dsa"})

    payload = {"decks": [{"name": "leetcode", "notes": [{"name": "n", "content": "c", "tags": ["DSA"]}]}]}
    result = import_notes(client, payload)

    assert result["new_decks"] == 0
    assert result["new_tags"] == 0
    assert len(client.get("/api/projects/list").json()) == 1
    assert len([t for t in client.get("/api/tags/list").json() if not t["is_difficulty"]]) == 1


def test_a_notes_own_deck_wins_over_its_enclosing_deck(client):
    payload = {
        "decks": [
            {"name": "Outer", "notes": [{"name": "n", "content": "c", "deck": "Inner"}]}
        ]
    }
    import_notes(client, payload)
    note = client.get("/api/notes/list").json()["items"][0]
    assert note["project"]["name"] == "Inner"


def test_tags_named_after_difficulty_labels_are_ignored_with_a_warning(client):
    payload = {"notes": [{"name": "n", "content": "c", "tags": ["Easy"]}]}
    result = import_notes(client, payload)
    tag_names = {t["name"] for t in client.get("/api/notes/list").json()["items"][0]["tags"]}
    assert tag_names == {"Medium"}
    assert result["warnings"]


def test_reimporting_the_same_file_skips_duplicates(client):
    payload = {"notes": [{"name": "n", "content": "c"}]}
    import_notes(client, payload)
    second = import_notes(client, payload)

    assert second["notes_created"] == 0
    assert second["duplicates_skipped"] == 1
    assert len(second["issues"]) == 1
    assert client.get("/api/notes/list").json()["total"] == 1


def test_duplicates_are_scoped_per_deck(client):
    payload = {
        "decks": [
            {"name": "A", "notes": [{"name": "n", "content": "c"}]},
            {"name": "B", "notes": [{"name": "n", "content": "c"}]},
        ]
    }
    result = import_notes(client, payload)
    assert result["notes_created"] == 2
    assert result["duplicates_skipped"] == 0


def test_invalid_rows_are_skipped_with_a_reason_not_a_hard_failure(client):
    payload = {"notes": [{"name": "Fine", "content": "c"}, {"content": "no name"}, {"name": "  "}]}
    result = import_notes(client, payload)

    assert result["notes_created"] == 1
    assert result["invalid_skipped"] == 2
    assert client.get("/api/notes/list").json()["total"] == 1


def test_malformed_payload_shape_is_a_400_not_a_500(client):
    response = client.post("/api/import/notes", json={"payload": {"unexpected": "shape"}})
    assert response.status_code == 400


def test_non_object_row_is_an_issue_not_a_crash(client):
    payload = {"notes": ["not an object"]}
    result = import_notes(client, payload)
    assert result["invalid_skipped"] == 1
    assert result["notes_created"] == 0


def test_per_day_zero_makes_everything_due_now(client):
    payload = {"notes": [{"name": f"n{i}", "content": "c"} for i in range(3)]}
    result = import_notes(client, payload, per_day=0)
    assert result["due_today"] == 3
    assert result["days_span"] == 1


def test_a_decks_own_per_day_overrides_the_file_level_default(client):
    payload = {
        "decks": [
            {
                "name": "D",
                "per_day": 1,
                "notes": [{"name": "n1", "content": "c"}, {"name": "n2", "content": "c"}],
            }
        ]
    }
    result = import_notes(client, payload, per_day=10)
    deck_summary = result["decks"][0]
    assert deck_summary["per_day"] == 1
    assert result["days_span"] == 2


def test_out_of_range_per_day_400s(client):
    response = client.post(
        "/api/import/notes",
        json={"payload": {"notes": []}, "per_day": 5000, "dry_run": True},
    )
    assert response.status_code == 400
