use chrono::Duration;
use serde_json::Value;

use super::Rating;
use crate::time::Ts;

const PARAMETERS: [f64; 21] = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];
const DESIRED_RETENTION: f64 = 0.9;
const MAXIMUM_INTERVAL: i64 = 36500;
const STABILITY_MIN: f64 = 0.001;
const MIN_DIFFICULTY: f64 = 1.0;
const MAX_DIFFICULTY: f64 = 10.0;
const FUZZ_RANGES: [(f64, f64, f64); 3] = [
    (2.5, 7.0, 0.15),
    (7.0, 20.0, 0.1),
    (20.0, f64::INFINITY, 0.05),
];

fn decay() -> f64 {
    -PARAMETERS[20]
}

fn factor() -> f64 {
    0.9f64.powf(1.0 / decay()) - 1.0
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Learning = 1,
    Review = 2,
    Relearning = 3,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Card {
    pub card_id: i64,
    pub state: State,
    pub step: Option<i64>,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub due: Ts,
    pub last_review: Option<Ts>,
}

fn json_float(value: Option<f64>) -> String {
    match value {
        None => "null".into(),
        Some(v) => serde_json::to_string(&v).unwrap_or_else(|_| "null".into()),
    }
}

fn truthy_float(value: Option<&Value>) -> Result<Option<f64>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(b)) => Ok(b.then_some(1.0)),
        Some(Value::Number(n)) => {
            let v = n.as_f64().ok_or("bad number")?;
            Ok((v != 0.0).then_some(v))
        }
        Some(Value::String(s)) if s.is_empty() => Ok(None),
        Some(Value::String(s)) => s.trim().parse::<f64>().map(Some).map_err(|e| e.to_string()),
        Some(_) => Err("not a number".into()),
    }
}

fn int_value(value: &Value) -> Result<i64, String> {
    match value {
        Value::Number(n) => n
            .as_i64()
            .or_else(|| n.as_f64().map(|f| f.trunc() as i64))
            .ok_or_else(|| "bad integer".to_string()),
        Value::Bool(b) => Ok(*b as i64),
        Value::String(s) => s.trim().parse::<i64>().map_err(|e| e.to_string()),
        _ => Err("not an integer".into()),
    }
}

fn required<'a>(map: &'a serde_json::Map<String, Value>, key: &str) -> Result<&'a Value, String> {
    map.get(key).ok_or_else(|| format!("missing {key}"))
}

impl Card {
    pub fn new(now: Ts) -> Card {
        Card {
            card_id: now.0.timestamp_millis(),
            state: State::Learning,
            step: Some(0),
            stability: None,
            difficulty: None,
            due: now,
            last_review: None,
        }
    }

    pub fn from_value(value: &Value) -> Result<Card, String> {
        let map = value.as_object().ok_or("card must be an object")?;
        let card_id = int_value(required(map, "card_id")?)?;
        let state = match int_value(required(map, "state")?)? {
            1 => State::Learning,
            2 => State::Review,
            3 => State::Relearning,
            other => return Err(format!("unknown state {other}")),
        };
        let mut step = match required(map, "step")? {
            Value::Null => None,
            other => Some(int_value(other)?),
        };
        if state == State::Learning && step.is_none() {
            step = Some(0);
        }
        let stability = truthy_float(Some(required(map, "stability")?))?;
        let difficulty = truthy_float(Some(required(map, "difficulty")?))?;
        let due = required(map, "due")?
            .as_str()
            .and_then(Ts::parse)
            .ok_or("due must be an ISO date-time")?;
        let last_review = match map.get("last_review") {
            None => return Err("missing last_review".into()),
            Some(Value::Null) => None,
            Some(Value::String(s)) if s.is_empty() => None,
            Some(Value::String(s)) => {
                Some(Ts::parse(s).ok_or("last_review must be an ISO date-time")?)
            }
            Some(_) => return Err("last_review must be an ISO date-time".into()),
        };
        Ok(Card {
            card_id,
            state,
            step,
            stability,
            difficulty,
            due,
            last_review,
        })
    }

    pub fn from_json(text: &str) -> Result<Card, String> {
        let value: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        Card::from_value(&value)
    }

    pub fn to_json(&self) -> String {
        format!(
            "{{\"card_id\": {}, \"state\": {}, \"step\": {}, \"stability\": {}, \"difficulty\": {}, \"due\": {}, \"last_review\": {}}}",
            self.card_id,
            self.state as i64,
            self.step
                .map(|s| s.to_string())
                .unwrap_or_else(|| "null".into()),
            json_float(self.stability),
            json_float(self.difficulty),
            serde_json::to_string(&self.due.iso()).unwrap_or_default(),
            self.last_review
                .map(|t| serde_json::to_string(&t.iso()).unwrap_or_default())
                .unwrap_or_else(|| "null".into()),
        )
    }
}

fn floor_days(later: Ts, earlier: Ts) -> i64 {
    let micros = (later.0 - earlier.0).num_microseconds().unwrap_or(i64::MAX);
    micros.div_euclid(86_400_000_000)
}

fn clamp_difficulty(d: f64) -> f64 {
    d.clamp(MIN_DIFFICULTY, MAX_DIFFICULTY)
}

fn clamp_stability(s: f64) -> f64 {
    s.max(STABILITY_MIN)
}

fn rating_value(rating: Rating) -> f64 {
    match rating {
        Rating::Again => 1.0,
        Rating::Hard => 2.0,
        Rating::Good => 3.0,
        Rating::Easy => 4.0,
    }
}

fn initial_stability(rating: Rating) -> f64 {
    clamp_stability(PARAMETERS[rating_value(rating) as usize - 1])
}

fn initial_difficulty(rating: Rating, clamp: bool) -> f64 {
    let d = PARAMETERS[4] - (PARAMETERS[5] * (rating_value(rating) - 1.0)).exp() + 1.0;
    if clamp { clamp_difficulty(d) } else { d }
}

fn next_interval(stability: f64) -> i64 {
    let interval = (stability / factor()) * (DESIRED_RETENTION.powf(1.0 / decay()) - 1.0);
    (interval.round_ties_even() as i64).clamp(1, MAXIMUM_INTERVAL)
}

fn short_term_stability(stability: f64, rating: Rating) -> f64 {
    let mut increase = (PARAMETERS[17] * (rating_value(rating) - 3.0 + PARAMETERS[18])).exp()
        * stability.powf(-PARAMETERS[19]);
    if rating != Rating::Again {
        increase = increase.max(1.0);
    }
    clamp_stability(stability * increase)
}

fn next_difficulty(difficulty: f64, rating: Rating) -> f64 {
    let arg_1 = initial_difficulty(Rating::Easy, false);
    let delta = -(PARAMETERS[6] * (rating_value(rating) - 3.0));
    let arg_2 = difficulty + (10.0 - difficulty) * delta / 9.0;
    clamp_difficulty(PARAMETERS[7] * arg_1 + (1.0 - PARAMETERS[7]) * arg_2)
}

fn retrievability(card: &Card, now: Ts) -> f64 {
    match (card.last_review, card.stability) {
        (Some(last), Some(stability)) => {
            let elapsed = floor_days(now, last).max(0) as f64;
            (1.0 + factor() * elapsed / stability).powf(decay())
        }
        _ => 0.0,
    }
}

fn next_stability(difficulty: f64, stability: f64, r: f64, rating: Rating) -> f64 {
    let next = if rating == Rating::Again {
        let long_term = PARAMETERS[11]
            * difficulty.powf(-PARAMETERS[12])
            * ((stability + 1.0).powf(PARAMETERS[13]) - 1.0)
            * ((1.0 - r) * PARAMETERS[14]).exp();
        let short_term = stability / (PARAMETERS[17] * PARAMETERS[18]).exp();
        long_term.min(short_term)
    } else {
        let hard_penalty = if rating == Rating::Hard {
            PARAMETERS[15]
        } else {
            1.0
        };
        let easy_bonus = if rating == Rating::Easy {
            PARAMETERS[16]
        } else {
            1.0
        };
        stability
            * (1.0
                + PARAMETERS[8].exp()
                    * (11.0 - difficulty)
                    * stability.powf(-PARAMETERS[9])
                    * (((1.0 - r) * PARAMETERS[10]).exp() - 1.0)
                    * hard_penalty
                    * easy_bonus)
    };
    clamp_stability(next)
}

fn fuzzed_interval(days: i64) -> i64 {
    if (days as f64) < 2.5 {
        return days;
    }
    let mut delta = 1.0;
    for (start, end, factor) in FUZZ_RANGES {
        delta += factor * ((days as f64).min(end) - start).max(0.0);
    }
    let mut min_ivl = ((days as f64) - delta).round_ties_even() as i64;
    let mut max_ivl = ((days as f64) + delta).round_ties_even() as i64;
    min_ivl = min_ivl.max(2);
    max_ivl = max_ivl.min(MAXIMUM_INTERVAL);
    min_ivl = min_ivl.min(max_ivl);
    let random: f64 = rand::random();
    let fuzzed = random * ((max_ivl - min_ivl + 1) as f64) + min_ivl as f64;
    (fuzzed.round_ties_even() as i64).min(MAXIMUM_INTERVAL)
}

pub fn review(card: &Card, rating: Rating, now: Ts) -> Card {
    let mut card = card.clone();
    let days_since = card.last_review.map(|last| floor_days(now, last));
    let recent = matches!(days_since, Some(d) if d < 1);
    match card.state {
        State::Learning | State::Relearning => match (card.stability, card.difficulty) {
            (Some(stability), Some(difficulty)) => {
                if recent {
                    card.stability = Some(short_term_stability(stability, rating));
                } else {
                    let r = retrievability(&card, now);
                    card.stability = Some(next_stability(difficulty, stability, r, rating));
                }
                card.difficulty = Some(next_difficulty(difficulty, rating));
            }
            _ => {
                card.stability = Some(initial_stability(rating));
                card.difficulty = Some(initial_difficulty(rating, true));
            }
        },
        State::Review => {
            let stability = card.stability.unwrap_or_else(|| initial_stability(rating));
            let difficulty = card
                .difficulty
                .unwrap_or_else(|| initial_difficulty(rating, true));
            if recent {
                card.stability = Some(short_term_stability(stability, rating));
            } else {
                let r = retrievability(&card, now);
                card.stability = Some(next_stability(difficulty, stability, r, rating));
            }
            card.difficulty = Some(next_difficulty(difficulty, rating));
        }
    }
    card.state = State::Review;
    card.step = None;
    let days = fuzzed_interval(next_interval(card.stability.unwrap_or(STABILITY_MIN)));
    card.due = now.plus(Duration::days(days));
    card.last_review = Some(now);
    card
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_card_round_trips() {
        let now = Ts::now();
        let card = Card::new(now);
        assert_eq!(Card::from_json(&card.to_json()).unwrap(), card);
    }

    #[test]
    fn first_good_review_schedules_days_out() {
        let now = Ts::now();
        let reviewed = review(&Card::new(now), Rating::Good, now);
        assert_eq!(reviewed.state, State::Review);
        assert_eq!(reviewed.stability, Some(2.3065));
        assert!(reviewed.due > now.plus(Duration::days(1)));
    }

    #[test]
    fn again_is_sooner_than_easy() {
        let now = Ts::now();
        let card = review(&Card::new(now), Rating::Good, now);
        let later = card.due;
        let again = review(&card, Rating::Again, later);
        let easy = review(&card, Rating::Easy, later);
        assert!(again.due < easy.due);
    }

    #[test]
    fn reads_python_cards() {
        let text = r#"{"card_id": 1730000000000, "state": 2, "step": null, "stability": 10.5, "difficulty": 5.1, "due": "2026-11-05T19:23:35.784549+00:00", "last_review": "2026-10-26T19:23:35.784549+00:00"}"#;
        let card = Card::from_json(text).unwrap();
        assert_eq!(card.state, State::Review);
        assert_eq!(card.to_json(), text);
    }
}
