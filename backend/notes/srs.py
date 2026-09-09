from typing import Literal

Rating = Literal["again", "hard", "good", "easy"]

MIN_EASE = 1.3


def compute_next_review(
    ease_factor: float, interval_days: int, rating: Rating
) -> tuple[float, int]:
    """SM-2-lite: Anki-style fixed ease deltas with SM-2 bootstrap intervals
    (1 day -> 6 days -> previous_interval * ease_factor)."""
    if rating == "again":
        return max(MIN_EASE, ease_factor - 0.20), 1

    if rating == "hard":
        new_interval = max(1, round(interval_days * 1.2)) if interval_days > 0 else 1
        return max(MIN_EASE, ease_factor - 0.15), new_interval

    if rating == "good":
        if interval_days <= 0:
            new_interval = 1
        elif interval_days == 1:
            new_interval = 6
        else:
            new_interval = max(1, round(interval_days * ease_factor))
        return ease_factor, new_interval

    # easy
    if interval_days <= 0:
        base = 1
    elif interval_days == 1:
        base = 6
    else:
        base = round(interval_days * ease_factor)
    return ease_factor + 0.15, round(base * 1.3)
