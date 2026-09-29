import datetime
import json
from dataclasses import dataclass
from typing import Any, get_args

from fsrs import Card

from db.models import Note, Reminder
from notes.scheduling import Algorithm, Rating, snapshot_for_new_reminder
from notes.utils import to_utc, to_utc_iso

ALGORITHMS: tuple[str, ...] = get_args(Algorithm)
RATINGS: tuple[str, ...] = get_args(Rating)


class ReviewStateError(ValueError):
    pass


@dataclass
class Snapshot:
    ease_factor: float | None
    interval_days: int | None
    fsrs_card: str | None


@dataclass
class PastReview:
    due_at: datetime.datetime
    reviewed_at: datetime.datetime
    rating: Rating
    snapshot: Snapshot


@dataclass
class ReviewState:
    algorithm: Algorithm
    paused: bool
    due_at: datetime.datetime | None
    state: Snapshot
    history: list[PastReview]


def parse_datetime(value: Any, field: str) -> datetime.datetime:
    if not isinstance(value, str):
        raise ReviewStateError(f'"{field}" must be an ISO date-time.')
    try:
        return to_utc(datetime.datetime.fromisoformat(value))
    except ValueError as error:
        raise ReviewStateError(f'"{field}" is not a valid ISO date-time.') from error


def _optional_datetime(value: Any, field: str) -> datetime.datetime | None:
    return None if value is None else parse_datetime(value, field)


def _snapshot(raw: dict, where: str, *, require_card: bool) -> Snapshot:
    ease = raw.get("ease_factor")
    if ease is not None and (
        isinstance(ease, bool) or not isinstance(ease, int | float) or ease <= 0
    ):
        raise ReviewStateError(f'"ease_factor"{where} must be a positive number.')
    interval = raw.get("interval_days")
    if interval is not None and (
        isinstance(interval, bool) or not isinstance(interval, int) or interval < 0
    ):
        raise ReviewStateError(
            f'"interval_days"{where} must be a whole number of days.'
        )
    card = raw.get("fsrs_card")
    if card is None:
        if require_card:
            raise ReviewStateError(f'FSRS notes need an "fsrs_card"{where}.')
        card_json = None
    else:
        if not isinstance(card, dict):
            raise ReviewStateError(f'"fsrs_card"{where} must be an object.')
        try:
            card_json = Card.from_json(json.dumps(card)).to_json()
        except Exception as error:
            raise ReviewStateError(
                f'"fsrs_card"{where} is not a valid FSRS card.'
            ) from error
    return Snapshot(
        ease_factor=None if ease is None else float(ease),
        interval_days=interval,
        fsrs_card=card_json,
    )


def parse_review(raw: Any) -> ReviewState:
    if not isinstance(raw, dict):
        raise ReviewStateError('"review" must be an object.')
    algorithm = raw.get("algorithm")
    if algorithm not in ALGORITHMS:
        raise ReviewStateError(
            f'"review.algorithm" must be one of: {", ".join(ALGORITHMS)}.'
        )
    paused = raw.get("paused", False)
    if not isinstance(paused, bool):
        raise ReviewStateError('"review.paused" must be true or false.')
    history_raw = raw.get("history", [])
    if not isinstance(history_raw, list):
        raise ReviewStateError('"review.history" must be a list.')

    history: list[PastReview] = []
    for i, entry in enumerate(history_raw, start=1):
        where = f" in review #{i}"
        if not isinstance(entry, dict):
            raise ReviewStateError(f"Review #{i} in the history must be an object.")
        rating = entry.get("rating")
        if rating not in RATINGS:
            raise ReviewStateError(
                f'"rating"{where} must be one of: {", ".join(RATINGS)}.'
            )
        reviewed_at = parse_datetime(entry.get("reviewed_at"), f"reviewed_at{where}")
        due_at = (
            _optional_datetime(entry.get("due_at"), f"due_at{where}") or reviewed_at
        )
        history.append(
            PastReview(
                due_at=due_at,
                reviewed_at=reviewed_at,
                rating=rating,
                snapshot=_snapshot(entry, where, require_card=False),
            )
        )
    history.sort(key=lambda past: past.reviewed_at)

    return ReviewState(
        algorithm=algorithm,
        paused=paused,
        due_at=_optional_datetime(raw.get("due_at"), "review.due_at"),
        state=_snapshot(raw, " in review", require_card=algorithm == "fsrs"),
        history=history,
    )


def apply_review(
    note: Note, review: ReviewState, *, fallback_due: datetime.datetime
) -> None:
    note.algorithm = review.algorithm
    if review.state.ease_factor is not None:
        note.ease_factor = review.state.ease_factor
    if review.state.interval_days is not None:
        note.interval_days = review.state.interval_days
    note.fsrs_card = review.state.fsrs_card
    past = [
        Reminder(
            remind_at=entry.due_at,
            reviewed_at=entry.reviewed_at,
            rating=entry.rating,
            ease_factor=entry.snapshot.ease_factor,
            interval_days=entry.snapshot.interval_days,
            fsrs_card=entry.snapshot.fsrs_card,
        )
        for entry in review.history
    ]
    pending = Reminder(
        remind_at=review.due_at or fallback_due, **snapshot_for_new_reminder(note)
    )
    note.reminders = [*past, pending]


def _card(card_json: str | None) -> dict | None:
    return None if card_json is None else json.loads(card_json)


def _iso(value: datetime.datetime | None) -> str | None:
    return None if value is None else to_utc_iso(value)


def export_review(note: Note) -> dict:
    reminders = [r for r in note.reminders if r.deleted_at is None]
    pending = sorted(
        (r for r in reminders if r.reviewed_at is None),
        key=lambda r: to_utc(r.remind_at),
    )
    past = sorted(
        (r for r in reminders if r.reviewed_at is not None),
        key=lambda r: to_utc(r.reviewed_at),  # type: ignore[arg-type]
    )
    return {
        "algorithm": note.algorithm,
        "paused": note.paused_at is not None,
        "due_at": _iso(pending[0].remind_at) if pending else None,
        "ease_factor": note.ease_factor,
        "interval_days": note.interval_days,
        "fsrs_card": _card(note.fsrs_card),
        "history": [
            {
                "due_at": _iso(r.remind_at),
                "reviewed_at": _iso(r.reviewed_at),
                "rating": r.rating,
                "ease_factor": r.ease_factor,
                "interval_days": r.interval_days,
                "fsrs_card": _card(r.fsrs_card),
            }
            for r in past
        ],
    }
