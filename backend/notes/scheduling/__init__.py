import datetime

from db.models import Note, Reminder, utcnow

from .fsrs_scheduler import new_card_json, preview_fsrs, review_fsrs
from .sm2 import EASE_DELTA, review_sm2
from .types import Algorithm, Rating

__all__ = [
    "Algorithm",
    "Rating",
    "new_note_scheduling_state",
    "preview_note",
    "record_review",
    "restore_from_snapshot",
    "review_note",
    "snapshot_for_new_reminder",
]


def new_note_scheduling_state(algorithm: Algorithm) -> dict:
    if algorithm == "fsrs":
        return {"fsrs_card": new_card_json()}
    return {}


def snapshot_for_new_reminder(note: Note) -> dict:
    if note.algorithm == "fsrs":
        return {"fsrs_card": note.fsrs_card}
    return {"ease_factor": note.ease_factor, "interval_days": note.interval_days}


def review_note(note: Note, rating: Rating) -> datetime.datetime:
    if note.algorithm == "fsrs":
        if note.fsrs_card is None:
            raise ValueError(f"FSRS note {note.id} missing fsrs_card")
        new_card, due = review_fsrs(note.fsrs_card, rating)
        note.fsrs_card = new_card
        return due

    new_ease, new_interval = review_sm2(note.ease_factor, note.interval_days, rating)
    note.ease_factor = new_ease
    note.interval_days = new_interval
    return utcnow() + datetime.timedelta(days=new_interval)


def record_review(note: Note, reminder: Reminder, rating: Rating) -> Reminder:
    due_at = review_note(note, rating)
    reminder.reviewed_at = utcnow()
    reminder.rating = rating
    return Reminder(note_id=note.id, remind_at=due_at, **snapshot_for_new_reminder(note))


def restore_from_snapshot(note: Note, reminder: Reminder) -> None:
    if note.algorithm == "fsrs":
        if reminder.fsrs_card is not None:
            note.fsrs_card = reminder.fsrs_card
        return
    if reminder.ease_factor is not None:
        note.ease_factor = reminder.ease_factor
    if reminder.interval_days is not None:
        note.interval_days = reminder.interval_days


def preview_note(note: Note) -> dict[Rating, datetime.datetime]:
    if note.algorithm == "fsrs":
        if note.fsrs_card is None:
            raise ValueError(f"FSRS note {note.id} missing fsrs_card")
        return preview_fsrs(note.fsrs_card)

    previews: dict[Rating, datetime.datetime] = {}
    for rating in EASE_DELTA:
        _new_ease, new_interval = review_sm2(
            note.ease_factor, note.interval_days, rating
        )
        previews[rating] = utcnow() + datetime.timedelta(days=new_interval)
    return previews
