pub mod fsrs;
pub mod sm2;

use chrono::Duration;
use serde::{Deserialize, Serialize};

use crate::time::Ts;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

impl Rating {
    pub const ALL: [Rating; 4] = [Rating::Again, Rating::Hard, Rating::Good, Rating::Easy];

    pub fn as_str(&self) -> &'static str {
        match self {
            Rating::Again => "again",
            Rating::Hard => "hard",
            Rating::Good => "good",
            Rating::Easy => "easy",
        }
    }

    pub fn parse(raw: &str) -> Option<Rating> {
        Rating::ALL.into_iter().find(|r| r.as_str() == raw)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Algorithm {
    Sm2,
    Fsrs,
}

impl Algorithm {
    pub fn as_str(&self) -> &'static str {
        match self {
            Algorithm::Sm2 => "sm2",
            Algorithm::Fsrs => "fsrs",
        }
    }

    pub fn parse(raw: &str) -> Option<Algorithm> {
        match raw {
            "sm2" => Some(Algorithm::Sm2),
            "fsrs" => Some(Algorithm::Fsrs),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct Snapshot {
    pub ease_factor: Option<f64>,
    pub interval_days: Option<i64>,
    pub fsrs_card: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SchedulingState {
    pub algorithm: String,
    pub ease_factor: f64,
    pub interval_days: i64,
    pub fsrs_card: Option<String>,
}

impl SchedulingState {
    pub fn snapshot(&self) -> Snapshot {
        if self.algorithm == "fsrs" {
            Snapshot {
                ease_factor: None,
                interval_days: None,
                fsrs_card: self.fsrs_card.clone(),
            }
        } else {
            Snapshot {
                ease_factor: Some(self.ease_factor),
                interval_days: Some(self.interval_days),
                fsrs_card: None,
            }
        }
    }

    pub fn review(&mut self, rating: Rating, now: Ts) -> Result<Ts, String> {
        if self.algorithm == "fsrs" {
            let text = self
                .fsrs_card
                .as_deref()
                .ok_or("FSRS note is missing its card")?;
            let card = fsrs::review(&fsrs::Card::from_json(text)?, rating, now);
            self.fsrs_card = Some(card.to_json());
            return Ok(card.due);
        }
        let (ease, interval) = sm2::review(self.ease_factor, self.interval_days, rating);
        self.ease_factor = ease;
        self.interval_days = interval;
        Ok(now.plus(Duration::days(interval)))
    }

    pub fn preview(&self, now: Ts) -> Result<Vec<(Rating, Ts)>, String> {
        Rating::ALL
            .into_iter()
            .map(|rating| {
                let mut copy = self.clone();
                copy.review(rating, now).map(|due| (rating, due))
            })
            .collect()
    }

    pub fn restore(&mut self, snapshot: &Snapshot) {
        if self.algorithm == "fsrs" {
            if let Some(card) = &snapshot.fsrs_card {
                self.fsrs_card = Some(card.clone());
            }
            return;
        }
        if let Some(ease) = snapshot.ease_factor {
            self.ease_factor = ease;
        }
        if let Some(interval) = snapshot.interval_days {
            self.interval_days = interval;
        }
    }
}

pub fn new_card_json(algorithm: Algorithm, now: Ts) -> Option<String> {
    match algorithm {
        Algorithm::Fsrs => Some(fsrs::Card::new(now).to_json()),
        Algorithm::Sm2 => None,
    }
}
