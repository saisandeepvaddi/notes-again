from .types import Rating

MIN_EASE_FACTOR = 1.3
HARD_INTERVAL_MULTIPLIER = 1.2
EASY_BONUS = 1.3
EASE_DELTA: dict[Rating, float] = {
    "again": -0.20,
    "hard": -0.15,
    "good": 0.0,
    "easy": 0.15,
}


def review_sm2(ease_factor: float, interval_days: int, rating: Rating) -> tuple[float, int]:
    new_ease = max(MIN_EASE_FACTOR, ease_factor + EASE_DELTA[rating])

    if rating == "again":
        return new_ease, 1
    if interval_days <= 0:
        return new_ease, 1
    if interval_days == 1:
        return new_ease, 6

    if rating == "hard":
        new_interval = interval_days * HARD_INTERVAL_MULTIPLIER
    elif rating == "easy":
        new_interval = interval_days * new_ease * EASY_BONUS
    else:
        new_interval = interval_days * new_ease

    return new_ease, max(1, round(new_interval))
