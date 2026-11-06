use chrono::{Duration, NaiveTime, TimeZone, Utc};

use crate::time::Ts;

pub const MAX_PER_DAY: i64 = 1_000;

pub fn today_start_utc(now: Ts, tz_offset_minutes: i64) -> Ts {
    let offset = Duration::minutes(tz_offset_minutes);
    let local_now = now.0.naive_utc() - offset;
    let local_midnight = local_now.date().and_time(NaiveTime::MIN);
    Ts(Utc.from_utc_datetime(&(local_midnight + offset)))
}

pub struct Pacer {
    pub now: Ts,
    pub today_start: Ts,
    calls: i64,
}

impl Pacer {
    pub fn new(tz_offset_minutes: i64) -> Pacer {
        let now = Ts::now();
        Pacer {
            now,
            today_start: today_start_utc(now, tz_offset_minutes),
            calls: 0,
        }
    }

    pub fn day(&self, position: i64, per_day: i64) -> i64 {
        if per_day > 0 { position / per_day } else { 0 }
    }

    pub fn due_at(&mut self, day: i64) -> Ts {
        let base = if day == 0 {
            self.now.minus(Duration::minutes(1))
        } else {
            self.today_start.plus(Duration::days(day))
        };
        self.calls += 1;
        base.plus(Duration::milliseconds(self.calls - 1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_midnight_respects_offset() {
        let now = Ts::parse("2026-11-05T03:00:00Z").unwrap();
        assert_eq!(today_start_utc(now, 300).iso(), "2026-11-04T05:00:00+00:00");
        assert_eq!(today_start_utc(now, 0).iso(), "2026-11-05T00:00:00+00:00");
        assert_eq!(
            today_start_utc(now, -330).iso(),
            "2026-11-04T18:30:00+00:00"
        );
    }
}
