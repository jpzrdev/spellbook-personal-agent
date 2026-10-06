"""Cron expressions for routines and reminders: fire times within a day and a readable description."""

import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from apscheduler.triggers.cron import CronTrigger

from app import locales

_EN_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]

_TEXT = {
    "en": {
        "every_day": "every day",
        "weekdays": "Mon–Fri",
        "weekend": "weekends",
        "every_hours": "every {step}h (at :{minute:02d})",
        "every_hours_between": "every {step}h, from {start:02d}:00 to {end:02d}:00",
        "at": "{days} at {hour:02d}:{minute:02d}",
    },
    "pt-BR": {
        "every_day": "todo dia",
        "weekdays": "seg–sex",
        "weekend": "fim de semana",
        "every_hours": "a cada {step}h (min {minute:02d})",
        "every_hours_between": "a cada {step}h, das {start:02d}h às {end:02d}h",
        "at": "{days} às {hour:02d}:{minute:02d}",
    },
}


def create_trigger(expr: str, tz: ZoneInfo) -> CronTrigger:
    """CronTrigger with standard cron semantics (0 = Sunday).

    APScheduler 3.x's `CronTrigger.from_crontab` treats a numeric day of week with
    0 = Monday, so '1-5' would become Tue–Sat. We convert the numbers to names.
    """
    minute, hour, day_of_month, month, day_of_week = expr.split()
    day_of_week = re.sub(r"(?<!/)\b([0-7])\b", lambda m: _EN_NAMES[int(m.group(1))], day_of_week)
    return CronTrigger(
        minute=minute, hour=hour, day=day_of_month, month=month, day_of_week=day_of_week, timezone=tz
    )


def times_in_day(expr: str, day: date, tz: ZoneInfo) -> list[datetime]:
    """Every fire time of the expression within the day (in the given time zone)."""
    trigger = create_trigger(expr, tz)
    start = datetime.combine(day, time.min, tz)
    end = start + timedelta(days=1)
    fires: list[datetime] = []
    current = trigger.get_next_fire_time(None, start - timedelta(microseconds=1))
    while current and current < end:
        fires.append(current)
        previous = current
        current = trigger.get_next_fire_time(previous, current + timedelta(seconds=1))
    return fires


def _weekdays(field: str, language: str) -> str | None:
    text = _TEXT[language]
    names = locales.get(language).WEEKDAY_SHORT
    if field == "*":
        return text["every_day"]
    if field in ("1-5", "mon-fri"):
        return text["weekdays"]
    if field in ("0,6", "6,0", "sat,sun"):
        return text["weekend"]
    try:
        if "-" in field:
            a, b = (int(x) % 7 for x in field.split("-"))
            return f"{names[a]}–{names[b]}"
        return ", ".join(names[int(x) % 7] for x in field.split(","))
    except ValueError:
        return None


def describe(expr: str, language: str = "en") -> str:
    """'50 6 * * 1-5' → 'Mon–Fri at 06:50'. Falls back to the raw expression when unsure."""
    language = language if language in _TEXT else "en"
    text = _TEXT[language]
    parts = expr.split()
    if len(parts) != 5:
        return expr
    minute, hour, day_of_month, month, day_of_week = parts
    if day_of_month != "*" or month != "*":
        return expr
    days = _weekdays(day_of_week, language)
    suffix = "" if days in (None, text["every_day"]) else f", {days}"
    if minute.isdigit() and hour.startswith("*/"):
        return text["every_hours"].format(step=hour[2:], minute=int(minute)) + suffix
    if minute.isdigit() and (m := re.fullmatch(r"(\d+)-(\d+)/(\d+)", hour)):
        start, end, step = m.groups()
        return text["every_hours_between"].format(step=step, start=int(start), end=int(end)) + suffix
    if not (minute.isdigit() and hour.isdigit()):
        return expr
    if days is None:
        return expr
    return text["at"].format(days=days, hour=int(hour), minute=int(minute))


def last_fire(expr: str, now: datetime, tz: ZoneInfo, window_days: int = 35) -> datetime | None:
    """The most recent fire time up to `now` (APScheduler only computes the next one, so we walk forward
    from `now - window`). 35 days covers daily, weekly and monthly routines."""
    trigger = create_trigger(expr, tz)
    current = trigger.get_next_fire_time(None, now - timedelta(days=window_days))
    last = None
    while current and current <= now:
        last = current
        current = trigger.get_next_fire_time(current, current + timedelta(seconds=1))
    return last
