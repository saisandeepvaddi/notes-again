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
    return Card().to_json()


def preview_fsrs(card_json: str) -> dict[Rating, datetime.datetime]:
    card = Card.from_json(card_json)
    previews: dict[Rating, datetime.datetime] = {}
    for rating, fsrs_rating in _RATING_MAP.items():
        new_card, _review_log = _scheduler.review_card(
            card, fsrs_rating, review_datetime=utcnow()
        )
        previews[rating] = new_card.due
    return previews


def review_fsrs(card_json: str, rating: Rating) -> tuple[str, datetime.datetime]:
    card = Card.from_json(card_json)
    new_card, _review_log = _scheduler.review_card(
        card, _RATING_MAP[rating], review_datetime=utcnow()
    )
    return new_card.to_json(), new_card.due
