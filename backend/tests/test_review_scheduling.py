import datetime

from notes.scheduling.sm2 import review_sm2


def test_again_resets_interval_to_one_day_and_lowers_ease():
    ease, interval = review_sm2(2.5, 30, "again")
    assert interval == 1
    assert ease == 2.3


def test_again_never_drops_ease_below_the_floor():
    ease, _ = review_sm2(1.35, 10, "again")
    assert ease == 1.3


def test_bootstrap_ladder_is_the_same_regardless_of_rating():
    assert review_sm2(2.5, 0, "good")[1] == 1
    assert review_sm2(2.5, 0, "hard")[1] == 1
    assert review_sm2(2.5, 0, "easy")[1] == 1
    assert review_sm2(2.5, 1, "good")[1] == 6
    assert review_sm2(2.5, 1, "hard")[1] == 6
    assert review_sm2(2.5, 1, "easy")[1] == 6


def test_good_multiplies_interval_by_the_new_ease_and_leaves_ease_unchanged():
    ease, interval = review_sm2(2.5, 10, "good")
    assert ease == 2.5
    assert interval == 25


def test_hard_uses_a_fixed_multiplier_independent_of_ease():
    ease, interval = review_sm2(2.5, 10, "hard")
    assert ease == 2.35
    assert interval == 12


def test_easy_applies_ease_bonus_on_top_of_good_growth():
    ease, interval = review_sm2(2.5, 10, "easy")
    assert ease == 2.65
    assert interval == round(10 * 2.65 * 1.3)


def create_note(client, **body) -> dict:
    response = client.post("/api/notes/create", json={"name": "n", "content": "c", **body})
    assert response.status_code == 200, response.text
    return response.json()


def use_sm2(client) -> None:
    assert client.patch("/api/settings", json={"default_algorithm": "sm2"}).status_code == 200


def test_reviewing_records_the_rating_and_schedules_the_next_reminder(client):
    use_sm2(client)
    note = create_note(client)
    pending = note["reminders"][0]

    response = client.patch(
        f"/api/notes/reminders/{pending['id']}/now", json={"action": "review", "rating": "good"}
    )
    assert response.status_code == 200
    updated = response.json()

    reviewed = next(r for r in updated["reminders"] if r["id"] == pending["id"])
    assert reviewed["rating"] == "good"
    assert reviewed["reviewed_at"] is not None

    [next_reminder] = [r for r in updated["reminders"] if r["reviewed_at"] is None]
    due_at = datetime.datetime.fromisoformat(next_reminder["remind_at"])
    assert due_at > datetime.datetime.now(datetime.UTC)


def test_reviewing_an_fsrs_note_also_schedules_a_next_reminder(client):
    note = create_note(client)
    assert note["algorithm"] == "fsrs"
    pending = note["reminders"][0]

    response = client.patch(
        f"/api/notes/reminders/{pending['id']}/now", json={"action": "review", "rating": "good"}
    )
    assert response.status_code == 200
    [next_reminder] = [r for r in response.json()["reminders"] if r["reviewed_at"] is None]
    due_at = datetime.datetime.fromisoformat(next_reminder["remind_at"])
    assert due_at > datetime.datetime.now(datetime.UTC)


def test_review_without_a_rating_400s(client):
    note = create_note(client)
    pending = note["reminders"][0]
    response = client.patch(
        f"/api/notes/reminders/{pending['id']}/now", json={"action": "review"}
    )
    assert response.status_code == 400


def test_reviewing_a_missing_reminder_404s(client):
    response = client.patch(
        "/api/notes/reminders/999/now", json={"action": "review", "rating": "good"}
    )
    assert response.status_code == 404


def test_undo_review_restores_the_note_and_drops_the_new_reminder(client):
    use_sm2(client)
    note = create_note(client)
    pending = note["reminders"][0]

    reviewed = client.patch(
        f"/api/notes/reminders/{pending['id']}/now", json={"action": "review", "rating": "good"}
    ).json()
    assert reviewed["interval_days"] == 1

    undone = client.patch(
        f"/api/notes/reminders/{pending['id']}/now", json={"action": "undo_review"}
    )
    assert undone.status_code == 200
    body = undone.json()
    assert body["interval_days"] == 0
    assert len(body["reminders"]) == 1
    assert body["reminders"][0]["id"] == pending["id"]
    assert body["reminders"][0]["reviewed_at"] is None


def test_undoing_an_unreviewed_reminder_400s(client):
    note = create_note(client)
    pending = note["reminders"][0]
    response = client.patch(
        f"/api/notes/reminders/{pending['id']}/now", json={"action": "undo_review"}
    )
    assert response.status_code == 400


def test_only_the_most_recent_review_can_be_undone(client):
    use_sm2(client)
    note = create_note(client)
    first_pending = note["reminders"][0]

    once_reviewed = client.patch(
        f"/api/notes/reminders/{first_pending['id']}/now",
        json={"action": "review", "rating": "good"},
    ).json()
    [second_pending] = [r for r in once_reviewed["reminders"] if r["reviewed_at"] is None]
    client.patch(
        f"/api/notes/reminders/{second_pending['id']}/now",
        json={"action": "review", "rating": "good"},
    )

    stale_undo = client.patch(
        f"/api/notes/reminders/{first_pending['id']}/now", json={"action": "undo_review"}
    )
    assert stale_undo.status_code == 400
