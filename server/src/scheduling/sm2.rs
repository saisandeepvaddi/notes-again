use super::Rating;

const MIN_EASE_FACTOR: f64 = 1.3;
const HARD_INTERVAL_MULTIPLIER: f64 = 1.2;
const EASY_BONUS: f64 = 1.3;

fn ease_delta(rating: Rating) -> f64 {
    match rating {
        Rating::Again => -0.20,
        Rating::Hard => -0.15,
        Rating::Good => 0.0,
        Rating::Easy => 0.15,
    }
}

pub fn review(ease_factor: f64, interval_days: i64, rating: Rating) -> (f64, i64) {
    let new_ease = MIN_EASE_FACTOR.max(ease_factor + ease_delta(rating));
    if rating == Rating::Again || interval_days <= 0 {
        return (new_ease, 1);
    }
    if interval_days == 1 {
        return (new_ease, 6);
    }
    let interval = interval_days as f64;
    let next = match rating {
        Rating::Hard => interval * HARD_INTERVAL_MULTIPLIER,
        Rating::Easy => interval * new_ease * EASY_BONUS,
        _ => interval * new_ease,
    };
    (new_ease, (next.round_ties_even() as i64).max(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_the_classic_steps() {
        assert_eq!(review(2.5, 0, Rating::Good), (2.5, 1));
        assert_eq!(review(2.5, 1, Rating::Good), (2.5, 6));
        assert_eq!(review(2.5, 6, Rating::Good), (2.5, 15));
    }

    #[test]
    fn again_resets_interval_to_one_day_and_lowers_ease() {
        assert_eq!(review(2.5, 30, Rating::Again), (2.3, 1));
    }

    #[test]
    fn again_never_drops_ease_below_the_floor() {
        assert_eq!(review(1.35, 10, Rating::Again).0, 1.3);
    }

    #[test]
    fn bootstrap_ladder_is_the_same_regardless_of_rating() {
        for rating in [Rating::Good, Rating::Hard, Rating::Easy] {
            assert_eq!(review(2.5, 0, rating).1, 1);
            assert_eq!(review(2.5, 1, rating).1, 6);
        }
    }

    #[test]
    fn good_multiplies_interval_by_ease_and_leaves_ease_unchanged() {
        assert_eq!(review(2.5, 10, Rating::Good), (2.5, 25));
    }

    #[test]
    fn hard_uses_a_fixed_multiplier_independent_of_ease() {
        assert_eq!(review(2.5, 10, Rating::Hard), (2.35, 12));
    }

    #[test]
    fn easy_applies_ease_bonus_on_top_of_good_growth() {
        let (ease, interval) = review(2.5, 10, Rating::Easy);
        assert_eq!(ease, 2.65);
        assert_eq!(interval, (10.0_f64 * 2.65 * 1.3).round_ties_even() as i64);
    }
}
