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
    """SM-2-lite driven by a 4-point Again/Hard/Good/Easy rating.

    A hand-labeled approximation of classic Anki SM-2 button semantics
    (same default deltas/multipliers Anki itself used, just expressed as
    float deltas on this app's ~2.5 ease scale instead of Anki's permille):

    - Again: ease -0.20 (floored at 1.3), interval resets to 1 day -- a
      lapse, not a fresh bootstrap, so it always jumps to 1 even from a
      long-matured interval, never back into the 6-day bootstrap step.
    - Hard: ease -0.15, interval *= 1.2 (fixed multiplier, independent of
      ease).
    - Good: ease unchanged, interval *= new ease_factor -- the original
      SM-2 rule, and what this app already did for every rating pre-FSRS.
    - Easy: ease +0.15, interval *= new ease_factor * 1.3 (Anki's default
      "easy bonus" on top of Good's growth).

    The 0 -> 1 -> 6 bootstrap ladder for a note's first two successful
    reviews applies the same way regardless of rating (hard/good/easy) --
    there's no existing interval yet for a multiplier to act on.
    """
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
    else:  # good
        new_interval = interval_days * new_ease

    return new_ease, max(1, round(new_interval))
