import datetime

from db.models import utcnow

MAX_PER_DAY = 1_000


def today_start_utc(tz_offset_minutes: int) -> datetime.datetime:
    offset = datetime.timedelta(minutes=tz_offset_minutes)
    local_now = utcnow().replace(tzinfo=None) - offset
    local_midnight = datetime.datetime.combine(local_now.date(), datetime.time.min)
    return (local_midnight + offset).replace(tzinfo=datetime.UTC)


class Pacer:
    def __init__(self, tz_offset_minutes: int) -> None:
        self.now = utcnow()
        self.today_start = today_start_utc(tz_offset_minutes)
        self._calls = 0

    def day(self, position: int, per_day: int) -> int:
        return position // per_day if per_day > 0 else 0

    def due_at(self, day: int) -> datetime.datetime:
        base = (
            self.now - datetime.timedelta(minutes=1)
            if day == 0
            else self.today_start + datetime.timedelta(days=day)
        )
        self._calls += 1
        return base + datetime.timedelta(milliseconds=self._calls - 1)
