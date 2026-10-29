from sync.merge import merge_note, merge_record, merge_set


def reminder(
    created_at: str, reviewed_at: str | None = None, rating: str | None = None
):
    return {
        "remind_at": created_at,
        "created_at": created_at,
        "updated_at": created_at,
        "deleted_at": None,
        "reviewed_at": reviewed_at,
        "rating": rating,
        "ease_factor": None,
        "interval_days": None,
        "fsrs_card": "card-0",
    }


def note(**overrides):
    base = {
        "name": "Title",
        "content": "Body",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
        "deleted_at": None,
        "paused_at": None,
        "in_review": True,
        "ease_factor": 2.5,
        "interval_days": 0,
        "algorithm": "fsrs",
        "fsrs_card": "card-0",
        "project": None,
        "tags": ["difficulty-medium"],
        "reminders": {"r0": reminder("2026-01-01T00:00:00+00:00")},
    }
    return {**base, **overrides}


def test_record_takes_each_sides_changes_and_the_client_wins_ties():
    base = {"name": "A", "paused": False, "deleted_at": None}
    server = {"name": "A", "paused": True, "deleted_at": None}
    client = {"name": "B", "paused": False, "deleted_at": None}
    assert merge_record(base, server, client) == {
        "name": "B",
        "paused": True,
        "deleted_at": None,
    }
    assert merge_record(base, {**server, "name": "C"}, client)["name"] == "B"


def test_tag_sets_keep_additions_and_removals_from_both_sides():
    assert merge_set(["a", "b"], ["a", "b", "c"], ["b", "d"]) == ["b", "c", "d"]


def test_edits_to_different_fields_merge_without_a_conflict():
    base = note()
    server = note(name="New title")
    client = note(content="New body")
    merged, conflict = merge_note(base, server, client)
    assert not conflict
    assert (merged["name"], merged["content"]) == ("New title", "New body")


def test_both_sides_editing_the_body_is_a_conflict_that_keeps_the_server_text():
    merged, conflict = merge_note(
        note(), note(content="Server"), note(content="Client")
    )
    assert conflict
    assert merged["content"] == "Server"


def test_identical_edits_are_not_a_conflict():
    merged, conflict = merge_note(note(), note(content="Same"), note(content="Same"))
    assert not conflict
    assert merged["content"] == "Same"


def test_an_edit_brings_back_a_note_the_other_side_deleted():
    deleted = "2026-02-01T00:00:00+00:00"
    merged, _ = merge_note(note(), note(deleted_at=deleted), note(content="Edited"))
    assert merged["deleted_at"] is None
    assert merged["content"] == "Edited"

    merged, _ = merge_note(note(), note(content="Edited"), note(deleted_at=deleted))
    assert merged["deleted_at"] is None


def test_a_delete_wins_when_the_other_side_only_changed_organization():
    deleted = "2026-02-01T00:00:00+00:00"
    merged, _ = merge_note(note(), note(project="p1"), note(deleted_at=deleted))
    assert merged["deleted_at"] == deleted
    assert merged["project"] == "p1"


def test_a_review_on_one_side_merges_with_an_edit_on_the_other():
    reviewed = {
        "r0": reminder(
            "2026-01-01T00:00:00+00:00", "2026-01-02T00:00:00+00:00", "good"
        ),
        "r1": reminder("2026-01-02T00:00:00+00:00"),
    }
    client = note(fsrs_card="card-1", reminders=reviewed)
    merged, conflict = merge_note(note(), note(content="Edited"), client)
    assert not conflict
    assert merged["content"] == "Edited"
    assert merged["fsrs_card"] == "card-1"
    assert merged["reminders"] == reviewed


def test_reviewing_the_same_card_on_both_sides_keeps_the_earlier_review():
    first = "2026-01-02T08:00:00+00:00"
    later = "2026-01-02T09:00:00+00:00"
    server = note(
        fsrs_card="server-card",
        reminders={
            "r0": reminder("2026-01-01T00:00:00+00:00", later, "again"),
            "s1": reminder(later),
        },
    )
    client = note(
        fsrs_card="client-card",
        reminders={
            "r0": reminder("2026-01-01T00:00:00+00:00", first, "good"),
            "c1": reminder(first),
        },
    )
    merged, conflict = merge_note(note(), server, client)
    assert not conflict
    assert merged["fsrs_card"] == "client-card"
    assert set(merged["reminders"]) == {"r0", "c1"}
    assert merged["reminders"]["r0"]["rating"] == "good"


def test_a_merge_never_leaves_two_pending_reminders():
    server = note(
        reminders={
            "r0": reminder("2026-01-01T00:00:00+00:00"),
            "s1": reminder("2026-03-01T00:00:00+00:00"),
        }
    )
    client = note(
        reminders={
            "r0": reminder("2026-01-01T00:00:00+00:00"),
            "c1": reminder("2026-02-01T00:00:00+00:00"),
        }
    )
    merged, _ = merge_note(note(), server, client)
    pending = [r for r in merged["reminders"].values() if r["reviewed_at"] is None]
    assert len(pending) == 1
