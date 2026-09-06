import datetime


def to_utc(dt: datetime.datetime) -> datetime.datetime:
    return (
        dt.replace(tzinfo=datetime.UTC)
        if dt.tzinfo is None
        else dt.astimezone(datetime.UTC)
    )


def to_utc_iso(dt: datetime.datetime) -> str:
    return to_utc(dt).isoformat()
