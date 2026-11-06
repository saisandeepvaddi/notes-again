use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

pub struct DifficultyTag {
    pub key: Difficulty,
    pub key_str: &'static str,
    pub name: &'static str,
    pub default_ease_factor: f64,
}

pub const DIFFICULTY_TAGS: [DifficultyTag; 3] = [
    DifficultyTag {
        key: Difficulty::Easy,
        key_str: "easy",
        name: "Easy",
        default_ease_factor: 2.8,
    },
    DifficultyTag {
        key: Difficulty::Medium,
        key_str: "medium",
        name: "Medium",
        default_ease_factor: 2.5,
    },
    DifficultyTag {
        key: Difficulty::Hard,
        key_str: "hard",
        name: "Hard",
        default_ease_factor: 1.8,
    },
];

impl Difficulty {
    pub fn tag(&self) -> &'static DifficultyTag {
        DIFFICULTY_TAGS
            .iter()
            .find(|t| t.key == *self)
            .expect("every difficulty has a tag")
    }

    pub fn parse(raw: &str) -> Option<Difficulty> {
        DIFFICULTY_TAGS
            .iter()
            .find(|t| t.key_str == raw)
            .map(|t| t.key)
    }

    pub fn uid(&self) -> String {
        format!("difficulty-{}", self.tag().key_str)
    }
}

pub fn key_for_tag_name(name: &str) -> Option<&'static str> {
    DIFFICULTY_TAGS
        .iter()
        .find(|t| t.name == name)
        .map(|t| t.key_str)
}

pub fn key_for_tag_name_ci(name: &str) -> Option<&'static str> {
    let lower = name.to_lowercase();
    DIFFICULTY_TAGS
        .iter()
        .find(|t| t.name.to_lowercase() == lower)
        .map(|t| t.key_str)
}
