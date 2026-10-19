import datetime

from tests.test_review_scheduling import create_note, use_sm2


def test_sm2_interval_preview_does_not_change_the_note_or_reminders(client):
    use_sm2(client)
    note = create_note(client, first_reminder_at="1970-01-01T00:00:00Z")

    response = client.get(f"/api/notes/{note['id']}/intervals")

    assert response.status_code == 200
    intervals = response.json()
    assert set(intervals) == {"again", "hard", "good", "easy"}
    due_times = [datetime.datetime.fromisoformat(due) for due in intervals.values()]
    assert (max(due_times) - min(due_times)).total_seconds() < 1
    after = client.get(f"/api/notes/{note['id']}").json()
    assert after["interval_days"] == note["interval_days"]
    assert after["ease_factor"] == note["ease_factor"]
    assert after["reminders"] == note["reminders"]


def test_fsrs_interval_preview_does_not_change_the_note_or_reminders(client):
    note = create_note(client, first_reminder_at="1970-01-01T00:00:00Z")

    response = client.get(f"/api/notes/{note['id']}/intervals")

    assert response.status_code == 200
    intervals = response.json()
    assert set(intervals) == {"again", "hard", "good", "easy"}
    assert datetime.datetime.fromisoformat(
        intervals["again"]
    ) < datetime.datetime.fromisoformat(intervals["easy"])
    after = client.get(f"/api/notes/{note['id']}").json()
    assert after["algorithm"] == note["algorithm"]
    assert after["reminders"] == note["reminders"]


def test_interval_preview_rejects_notes_not_in_review(client):
    note = create_note(client, in_review=False)

    response = client.get(f"/api/notes/{note['id']}/intervals")

    assert response.status_code == 400


def test_missing_note_interval_preview_404s(client):
    response = client.get("/api/notes/999/intervals")

    assert response.status_code == 404
