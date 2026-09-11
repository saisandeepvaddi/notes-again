def compute_next_interval(interval_days: int, ease_factor: float) -> int:
    """SM-2 bootstrap interval growth (1 day -> 6 days -> previous * ease_factor).

    Ease factor is fixed per difficulty tag (Easy/Medium/Hard), chosen by the
    user at review time, rather than nudged per review by a separate rating
    scale — the difficulty tag is the only "how hard is this" signal.
    """
    if interval_days <= 0:
        return 1
    if interval_days == 1:
        return 6
    return max(1, round(interval_days * ease_factor))
