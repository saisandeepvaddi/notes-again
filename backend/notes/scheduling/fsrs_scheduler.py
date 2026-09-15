"""FSRS-6 scheduling via the `fsrs` PyPI package (py-fsrs), using the
library's published default parameters -- no personal weight optimization,
since this single-user app doesn't have a review-history corpus worth
fitting weights to yet -- and Anki's own default 90% desired retention.

learning_steps/relearning_steps are set to () deliberately: those exist for
same-day, minutes-later re-prompts (Anki's live study session UX), which
this app has no equivalent of -- a Reminder is a day-granularity
notification, not a queue you sit and re-drill in one sitting. With empty
steps, every rating (including Again) goes straight into day-granularity
Review-state scheduling via the FSRS memory model, matching how this app's
SM-2 side already treats Again (next review is tomorrow-or-later, never "in
10 minutes").
"""

import datetime

from fsrs import Card, Scheduler
from fsrs import Rating as FsrsRating

from db.models import utcnow

from .types import Rating

_RATING_MAP: dict[Rating, FsrsRating] = {
    "again": FsrsRating.Again,
    "hard": FsrsRating.Hard,
    "good": FsrsRating.Good,
    "easy": FsrsRating.Easy,
}

_scheduler = Scheduler(desired_retention=0.9, learning_steps=(), relearning_steps=())


def new_card_json() -> str:
    """A fresh FSRS Card for a brand-new FSRS note, serialized for storage."""
    return Card().to_json()


def review_fsrs(card_json: str, rating: Rating) -> tuple[str, datetime.datetime]:
    """Advances one FSRS card by one review.

    Returns (new serialized card, next-due datetime). The ReviewLog py-fsrs
    also returns is intentionally discarded -- this app already records
    rating/reviewed_at on Reminder, and nothing needs FSRS's own separate
    review-log history.
    """
    card = Card.from_json(card_json)
    new_card, _review_log = _scheduler.review_card(
        card, _RATING_MAP[rating], review_datetime=utcnow()
    )
    return new_card.to_json(), new_card.due
