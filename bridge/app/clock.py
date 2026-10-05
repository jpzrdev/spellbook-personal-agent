"""Bridge clock, always in the configured time zone (TZ_NAME)."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import get_settings


def tz() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def now() -> datetime:
    return datetime.now(tz())
