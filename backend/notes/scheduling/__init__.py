"""Dispatches per-review scheduling to whichever algorithm a note was
created under (Note.algorithm) -- the one place notes/router.py needs to
branch on algorithm at all."""

import datetime

from db.models import Note, Reminder, utcnow

from .fsrs_scheduler import new_card_json, review_fsrs
from .sm2 import review_sm2
from .types import Algorithm, Rating

__all__ = [
    "Algorithm",
    "Rating",
    "new_note_scheduling_state",
    "restore_from_snapshot",
    "review_note",
    "snapshot_for_new_reminder",
]


def new_note_scheduling_state(algorithm: Algorithm) -> dict:
    """Extra fields to set on a just-created Note, beyond what
    apply_difficulty already seeds (ease_factor, for sm2)."""
    if algorithm == "fsrs":
        return {"fsrs_card": new_card_json()}
    return {}


def snapshot_for_new_reminder(note: Note) -> dict:
    """Fields to stamp onto a newly-created pending Reminder so a future
    review of it can be undone back to the note's current state."""
    if note.algorithm == "fsrs":
        return {"fsrs_card": note.fsrs_card}
    return {"ease_factor": note.ease_factor, "interval_days": note.interval_days}


def review_note(note: Note, rating: Rating) -> datetime.datetime:
    """Applies `rating` to `note`'s scheduling state in place; returns the
    next reminder's due datetime. Caller creates the next Reminder (via
    snapshot_for_new_reminder) and commits."""
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


def restore_from_snapshot(note: Note, reminder: Reminder) -> None:
    """Undo: restores note's scheduling state from the pre-review snapshot
    stored on `reminder` (the reviewed reminder being undone)."""
    if note.algorithm == "fsrs":
        if reminder.fsrs_card is not None:
            note.fsrs_card = reminder.fsrs_card
        return
    if reminder.ease_factor is not None:
        note.ease_factor = reminder.ease_factor
    if reminder.interval_days is not None:
        note.interval_days = reminder.interval_days
