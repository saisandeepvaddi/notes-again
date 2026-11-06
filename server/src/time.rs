use std::fmt;

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, SubsecRound, TimeZone, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::sqlite::{SqliteArgumentsBuffer, SqliteTypeInfo, SqliteValueRef};
use sqlx::{Decode, Encode, Sqlite, Type};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Ts(pub DateTime<Utc>);

const DB_FORMAT: &str = "%Y-%m-%d %H:%M:%S%.6f";

impl Ts {
    pub fn now() -> Self {
        Ts(Utc::now().trunc_subsecs(6))
    }

    pub fn db(&self) -> String {
        self.0.format(DB_FORMAT).to_string()
    }

    pub fn iso(&self) -> String {
        let base = self.0.format("%Y-%m-%dT%H:%M:%S").to_string();
        let micros = self.0.timestamp_subsec_micros();
        if micros == 0 {
            format!("{base}+00:00")
        } else {
            format!("{base}.{micros:06}+00:00")
        }
    }

    pub fn iso_seconds_z(&self) -> String {
        self.0.format("%Y-%m-%dT%H:%M:%SZ").to_string()
    }

    pub fn parse(raw: &str) -> Option<Ts> {
        parse_datetime(raw).map(|dt| Ts(dt.trunc_subsecs(6)))
    }

    pub fn plus(&self, duration: Duration) -> Ts {
        Ts(self.0 + duration)
    }

    pub fn minus(&self, duration: Duration) -> Ts {
        Ts(self.0 - duration)
    }

    pub fn since(&self, earlier: Ts) -> Duration {
        self.0 - earlier.0
    }

    pub fn from_timestamp(seconds: i64, nanos: u32) -> Ts {
        Ts(Utc
            .timestamp_opt(seconds, nanos)
            .single()
            .unwrap_or_default()
            .trunc_subsecs(6))
    }
}

impl fmt::Display for Ts {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.iso())
    }
}

fn parse_datetime(raw: &str) -> Option<DateTime<Utc>> {
    let text = raw.trim();
    if text.is_empty() {
        return None;
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(text) {
        return Some(dt.with_timezone(&Utc));
    }
    let normalized = text.replacen(' ', "T", 1);
    if let Ok(dt) = DateTime::parse_from_rfc3339(&normalized) {
        return Some(dt.with_timezone(&Utc));
    }
    for format in [
        "%Y-%m-%dT%H:%M:%S%.f%:z",
        "%Y-%m-%dT%H:%M:%S%.f%z",
        "%Y-%m-%dT%H:%M%:z",
        "%Y-%m-%dT%H:%M%z",
        "%Y-%m-%dT%H%:z",
    ] {
        if let Ok(dt) = DateTime::parse_from_str(&normalized, format) {
            return Some(dt.with_timezone(&Utc));
        }
    }
    let without_z = normalized.strip_suffix('Z').unwrap_or(&normalized);
    for format in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H"] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(without_z, format) {
            return Some(Utc.from_utc_datetime(&naive));
        }
    }
    if let Ok(date) = NaiveDate::parse_from_str(without_z, "%Y-%m-%d") {
        return Some(Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0)?));
    }
    None
}

impl Serialize for Ts {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.iso())
    }
}

impl<'de> Deserialize<'de> for Ts {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        Ts::parse(&raw).ok_or_else(|| serde::de::Error::custom("Input should be a valid datetime"))
    }
}

impl Type<Sqlite> for Ts {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<Sqlite>>::type_info()
    }

    fn compatible(ty: &SqliteTypeInfo) -> bool {
        <String as Type<Sqlite>>::compatible(ty) || <i64 as Type<Sqlite>>::compatible(ty)
    }
}

impl Encode<'_, Sqlite> for Ts {
    fn encode_by_ref(&self, args: &mut SqliteArgumentsBuffer) -> Result<IsNull, BoxDynError> {
        <String as Encode<Sqlite>>::encode(self.db(), args)
    }
}

impl<'r> Decode<'r, Sqlite> for Ts {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, BoxDynError> {
        let raw = <String as Decode<Sqlite>>::decode(value)?;
        Ts::parse(&raw).ok_or_else(|| format!("not a datetime: {raw}").into())
    }
}
