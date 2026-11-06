use serde_json::{Map, Value, json};

use crate::db::models::ReminderRow;
use crate::notes::{FullNote, PastReview, RestoredReview};
use crate::scheduling::fsrs::Card;
use crate::scheduling::{Algorithm, Rating, Snapshot};
use crate::time::Ts;

pub struct ReviewState {
    pub algorithm: Algorithm,
    pub paused: bool,
    pub in_review: bool,
    pub due_at: Option<Ts>,
    pub state: Snapshot,
    pub history: Vec<PastReview>,
}

impl ReviewState {
    pub fn restored(&self, fallback_due: Ts) -> RestoredReview {
        RestoredReview {
            algorithm: self.algorithm,
            ease_factor: self.state.ease_factor,
            interval_days: self.state.interval_days,
            fsrs_card: self.state.fsrs_card.clone(),
            history: self
                .history
                .iter()
                .map(|p| PastReview {
                    due_at: p.due_at,
                    reviewed_at: p.reviewed_at,
                    rating: p.rating.clone(),
                    snapshot: p.snapshot.clone(),
                })
                .collect(),
            pending_due: Some(self.due_at.unwrap_or(fallback_due)),
        }
    }
}

pub fn parse_datetime(value: Option<&Value>, field: &str) -> Result<Ts, String> {
    let Some(Value::String(text)) = value else {
        return Err(format!("\"{field}\" must be an ISO date-time."));
    };
    Ts::parse(text).ok_or_else(|| format!("\"{field}\" is not a valid ISO date-time."))
}

fn optional_datetime(value: Option<&Value>, field: &str) -> Result<Option<Ts>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        other => parse_datetime(other, field).map(Some),
    }
}

fn snapshot(raw: &Map<String, Value>, place: &str, require_card: bool) -> Result<Snapshot, String> {
    let ease = match raw.get("ease_factor") {
        None | Some(Value::Null) => None,
        Some(Value::Number(n)) if n.as_f64().is_some_and(|v| v > 0.0) => n.as_f64(),
        Some(_) => return Err(format!("\"ease_factor\"{place} must be a positive number.")),
    };
    let interval = match raw.get("interval_days") {
        None | Some(Value::Null) => None,
        Some(Value::Number(n)) if n.as_i64().is_some_and(|v| v >= 0) => n.as_i64(),
        Some(_) => {
            return Err(format!(
                "\"interval_days\"{place} must be a whole number of days."
            ));
        }
    };
    let card = match raw.get("fsrs_card") {
        None | Some(Value::Null) => {
            if require_card {
                return Err(format!("FSRS notes need an \"fsrs_card\"{place}."));
            }
            None
        }
        Some(value @ Value::Object(_)) => Some(
            Card::from_value(value)
                .map_err(|_| format!("\"fsrs_card\"{place} is not a valid FSRS card."))?
                .to_json(),
        ),
        Some(_) => return Err(format!("\"fsrs_card\"{place} must be an object.")),
    };
    Ok(Snapshot {
        ease_factor: ease,
        interval_days: interval,
        fsrs_card: card,
    })
}

fn bool_field(
    raw: &Map<String, Value>,
    key: &str,
    default: bool,
    message: &str,
) -> Result<bool, String> {
    match raw.get(key) {
        None => Ok(default),
        Some(Value::Bool(b)) => Ok(*b),
        Some(_) => Err(message.to_string()),
    }
}

pub fn parse_review(raw: &Value) -> Result<ReviewState, String> {
    let Value::Object(raw) = raw else {
        return Err("\"review\" must be an object.".into());
    };
    let algorithm = raw
        .get("algorithm")
        .and_then(Value::as_str)
        .and_then(Algorithm::parse)
        .ok_or("\"review.algorithm\" must be one of: sm2, fsrs.")?;
    let paused = bool_field(
        raw,
        "paused",
        false,
        "\"review.paused\" must be true or false.",
    )?;
    let in_review = bool_field(
        raw,
        "in_review",
        true,
        "\"review.in_review\" must be true or false.",
    )?;
    let history_raw = match raw.get("history") {
        None => vec![],
        Some(Value::Array(items)) => items.clone(),
        Some(_) => return Err("\"review.history\" must be a list.".into()),
    };
    let mut history = vec![];
    for (i, entry) in history_raw.iter().enumerate() {
        let i = i + 1;
        let place = format!(" in review #{i}");
        let Value::Object(entry) = entry else {
            return Err(format!("Review #{i} in the history must be an object."));
        };
        let rating = entry
            .get("rating")
            .and_then(Value::as_str)
            .and_then(Rating::parse)
            .ok_or_else(|| format!("\"rating\"{place} must be one of: again, hard, good, easy."))?;
        let reviewed_at = parse_datetime(entry.get("reviewed_at"), &format!("reviewed_at{place}"))?;
        let due_at = optional_datetime(entry.get("due_at"), &format!("due_at{place}"))?
            .unwrap_or(reviewed_at);
        history.push(PastReview {
            due_at,
            reviewed_at,
            rating: rating.as_str().to_string(),
            snapshot: snapshot(entry, &place, false)?,
        });
    }
    history.sort_by_key(|p| p.reviewed_at);
    Ok(ReviewState {
        algorithm,
        paused,
        in_review,
        due_at: optional_datetime(raw.get("due_at"), "review.due_at")?,
        state: snapshot(raw, " in review", algorithm == Algorithm::Fsrs)?,
        history,
    })
}

fn card(text: &Option<String>) -> Value {
    text.as_deref()
        .and_then(|t| serde_json::from_str(t).ok())
        .unwrap_or(Value::Null)
}

fn iso(value: Option<Ts>) -> Value {
    value.map(|t| Value::String(t.iso())).unwrap_or(Value::Null)
}

pub fn export_review(full: &FullNote) -> Value {
    let live: Vec<&ReminderRow> = full
        .reminders
        .iter()
        .filter(|r| r.deleted_at.is_none())
        .collect();
    let mut pending: Vec<&&ReminderRow> = live.iter().filter(|r| r.reviewed_at.is_none()).collect();
    pending.sort_by_key(|r| r.remind_at);
    let mut past: Vec<&&ReminderRow> = live.iter().filter(|r| r.reviewed_at.is_some()).collect();
    past.sort_by_key(|r| r.reviewed_at);
    let note = &full.note;
    json!({
        "algorithm": note.algorithm,
        "paused": note.paused_at.is_some(),
        "in_review": note.in_review,
        "due_at": iso(pending.first().map(|r| r.remind_at)),
        "ease_factor": note.ease_factor,
        "interval_days": note.interval_days,
        "fsrs_card": card(&note.fsrs_card),
        "history": past.iter().map(|r| json!({
            "due_at": iso(Some(r.remind_at)),
            "reviewed_at": iso(r.reviewed_at),
            "rating": r.rating,
            "ease_factor": r.ease_factor,
            "interval_days": r.interval_days,
            "fsrs_card": card(&r.fsrs_card),
        })).collect::<Vec<_>>(),
    })
}
