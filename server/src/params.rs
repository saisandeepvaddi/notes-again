use serde::{Deserialize, Deserializer};

use crate::error::ApiError;

pub fn parse_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" | "t" | "y" => Some(true),
        "0" | "false" | "no" | "off" | "f" | "n" => Some(false),
        _ => None,
    }
}

pub fn lenient_bool<'de, D: Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    let raw = String::deserialize(deserializer)?;
    parse_bool(&raw).ok_or_else(|| serde::de::Error::custom("Input should be a valid boolean"))
}

pub fn lenient_opt_bool<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<bool>, D::Error> {
    let raw = Option::<String>::deserialize(deserializer)?;
    match raw {
        None => Ok(None),
        Some(text) => parse_bool(&text)
            .map(Some)
            .ok_or_else(|| serde::de::Error::custom("Input should be a valid boolean")),
    }
}

pub fn check_range(name: &str, value: i64, min: i64, max: i64) -> Result<(), ApiError> {
    if value < min {
        return Err(ApiError::unprocessable(format!(
            "{name}: Input should be greater than or equal to {min}"
        )));
    }
    if value > max {
        return Err(ApiError::unprocessable(format!(
            "{name}: Input should be less than or equal to {max}"
        )));
    }
    Ok(())
}

pub fn check_len(name: &str, value: &str, max: usize) -> Result<(), ApiError> {
    if value.chars().count() > max {
        return Err(ApiError::unprocessable(format!(
            "{name}: String should have at most {max} characters"
        )));
    }
    Ok(())
}

pub fn check_opt_len(name: &str, value: Option<&str>, max: usize) -> Result<(), ApiError> {
    match value {
        Some(text) => check_len(name, text, max),
        None => Ok(()),
    }
}

pub fn dedupe<T: Clone + Eq + std::hash::Hash>(items: &[T]) -> Vec<T> {
    let mut seen = std::collections::HashSet::new();
    items
        .iter()
        .filter(|item| seen.insert((*item).clone()))
        .cloned()
        .collect()
}

pub fn id_list(ids: &[i64]) -> String {
    ids.iter().map(i64::to_string).collect::<Vec<_>>().join(",")
}
