"""Capture triage: decides where each thing the user asks to remember goes.

| Destination | When |
|---|---|
| reminder (life/reminders.md + push) | a nudge at a moment: "in 30 min", "tomorrow 9am call the bank", "every day 10pm medicine" |
| event (Google Calendar, with confirmation) | an appointment that takes time / has a place / other people, yearly dates (birthdays) |
| task (life/tasks.md) | something to do with no exact time ("pay the bill by Friday") |
| note (raw/) | information to keep, with no action or date |

Tier 1 only handles unambiguous reminders (clear time, not an appointment), without AI.
Everything else goes to Tier 2, which returns `{"action": "capture", "items": [...]}`; `execute` saves them.
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from app import locales, proposals, push
from app import reminders as reminder_scheduler
from app.config import get_settings
from app.gandalf.tier1 import date_long, extract_date, task_dict
from app.locales import t
from app.vault import reminders, writer


def norm_aligned(text: str) -> str:
    """Lowercase without accents with the SAME length as the original (to cut excerpts)."""
    out = []
    for c in text:
        n = unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode().lower()
        out.append(n[0] if n else " ")
    return "".join(out)


@dataclass
class ParsedReminder:
    text: str
    when: datetime | None = None
    recurrence: str | None = None


def _cut(original: str, spans: list[tuple[int, int]]) -> str:
    loc = locales.current()
    text = original
    for a, b in sorted(spans, reverse=True):
        text = text[:a] + " " + text[b:]
    text = re.sub(r"\s{2,}", " ", text).strip(" ,.;:-!?")
    n = norm_aligned(text)
    if m := loc.LEADING_CONNECTORS.match(n):
        text, n = text[m.end():], n[m.end():]
    if m := loc.TRAILING_CONNECTORS.search(n):
        text = text[: m.start()]
    text = text.strip(" ,.;:-!?")
    return text[:1].upper() + text[1:] if text else text


def parse_reminder(text: str, now: datetime) -> ParsedReminder | None:
    """An unambiguous reminder ("remind me to X in 30 min", "remind me tomorrow at 9am to Y",
    "reminder: medicine every day at 10pm"). None = leave it to Tier 2."""
    loc = locales.current()
    original = re.sub(r"\s+", " ", text.strip()).rstrip(" ?!.")
    n = norm_aligned(original)
    g = loc.TRIGGER_RE.match(n)
    if not g:
        return None
    start = g.start("rest")
    rest_o, rest_n = original[start:], n[start:]

    # 1) relative: "in 30 min", "in 2 hours", "in half an hour", "in 1h30"
    if m := loc.RELATIVE_RE.search(rest_n):
        delta = loc.parse_relative(m)
        if not timedelta(minutes=1) <= delta <= timedelta(days=7):
            return None
        text_r = _cut(rest_o, [m.span()])
        return ParsedReminder(text_r, when=(now + delta).replace(second=0, microsecond=0)) if text_r else None

    # 2) absolute time (required from here on)
    spans: list[tuple[int, int]] = []
    m = loc.ABSOLUTE_RE.search(rest_n) or loc.ABSOLUTE_AT_RE.search(rest_n)
    if not m:
        return None
    hour = loc.parse_time(m)
    if hour is None:
        return None
    spans.append(m.span())

    # 3) recurrence
    days: list[int] | None = None  # [] = every day
    if r := loc.EVERY_DAY_RE.search(rest_n):
        days = []
    elif r := loc.WEEKDAYS_ONLY_RE.search(rest_n):
        days = [1, 2, 3, 4, 5]
    elif r := loc.WEEKEND_RE.search(rest_n):
        days = [0, 6]
    elif r := loc.EVERY_RE.search(rest_n):
        days = sorted({loc.CRON_DAYS[x] for x in re.findall(loc.DAY_NAME, r.group(0))})
    if r:
        spans.append(r.span())

    if loc.APPOINTMENT_RE.search(rest_n):
        return None  # may be a calendar appointment: Tier 2 decides

    if days is not None:
        dow = ",".join(map(str, days)) if days else "*"
        text_r = _cut(rest_o, spans)
        return ParsedReminder(text_r, recurrence=f"{hour.minute} {hour.hour} * * {dow}") if text_r else None

    # 4) date (today, tomorrow, friday, 10/10…) without recurrence
    without_time = rest_n[: m.start()] + " " * (m.end() - m.start()) + rest_n[m.end():]
    day, after = extract_date(without_time, now.date())
    if day is not None:
        # extract_date returns the text without the expression: find the removed excerpt by comparing both
        a = next((i for i, (x, y) in enumerate(zip(without_time, after)) if x != y), len(after))
        spans.append((a, a + len(without_time) - len(after)))
    when = datetime.combine(day or now.date(), hour, now.tzinfo)
    if when <= now:
        if day is not None:
            return None  # "today at 8" when it's already 10: ambiguous
        when += timedelta(days=1)
    text_r = _cut(rest_o, spans)
    return ParsedReminder(text_r, when=when) if text_r else None


# ---------- descriptions for the user ----------

def describe_when(when: datetime, now: datetime) -> str:
    hour = f"{when:%H:%M}"
    if when.date() == now.date():
        day = t("today")
    elif when.date() == now.date() + timedelta(days=1):
        day = t("tomorrow")
    else:
        day = date_long(when.date())
    left = when - now
    extra = ""
    if timedelta(0) < left < timedelta(hours=3):
        minutes = round(left.total_seconds() / 60)
        extra = t("when.in_minutes", minutes=minutes) if minutes < 60 else t("when.in_hours", hours=minutes // 60, minutes=minutes % 60)
    return t("when.at", day=day, time=hour, extra=extra)


def describe_recurrence(cron_expr: str) -> str:
    from app import cron

    return cron.describe(cron_expr, get_settings().language)


def describe_event(e: proposals.Event) -> str:
    day = date_long(date.fromisoformat(e.date))
    hour = t("event.all_day") if e.all_day else f"{e.start_time}–{e.end_time}"
    repeat = t(f"repeat.{e.repeat}") if e.repeat else ""
    return f"**{e.title}**, {day} ({hour}{', ' + repeat if repeat else ''})"


def _no_devices() -> str:
    return "" if push.subscriptions() else t("capture.no_devices")


# ---------- execution ----------

def create_reminder(vault: Path, tz: ZoneInfo, item: ParsedReminder, now: datetime, hint: bool = True) -> tuple[str, dict]:
    x = reminders.add(vault, tz, item.text, when=item.when, recurrence=item.recurrence)
    reminder_scheduler.reload_if_running(vault)
    when = describe_recurrence(x.recurrence) if x.recurring else describe_when(x.when, now)
    text = t("capture.reminder", text=x.text, when=when)
    return text + (_no_devices() if hint else ""), reminder_scheduler.reminder_json(x)


def _reminder_from_item(item: dict, now: datetime) -> ParsedReminder:
    text = str(item.get("text") or "").strip()
    if not text:
        raise ValueError("reminder without text")
    if item.get("when"):
        when = datetime.fromisoformat(str(item["when"]).replace("Z", ""))
        when = (when if when.tzinfo else when.replace(tzinfo=now.tzinfo)).replace(second=0, microsecond=0)
        if when <= now - timedelta(minutes=1):
            raise ValueError(f"the reminder time has already passed ({when:%Y-%m-%d %H:%M})")
        return ParsedReminder(text, when=when)
    hour = str(item.get("time") or "").strip()
    if not re.fullmatch(r"\d{1,2}:\d{2}", hour):
        raise ValueError("reminder without a time")
    h, m = map(int, hour.split(":"))
    days = sorted({int(d) % 7 for d in item.get("weekdays") or []})
    return ParsedReminder(text, recurrence=f"{m} {h} * * {','.join(map(str, days)) if days else '*'}")


def execute(vault: Path, tz: ZoneInfo, items: list[dict], now: datetime, request: str, source: str) -> tuple[str, dict]:
    """Saves the items decided by Tier 2. Events become proposals (they don't go straight to the calendar)."""
    lines: list[str] = []
    data: dict = {"reminders": [], "tasks": [], "notes": [], "proposals": [], "errors": []}
    for item in items[:6]:
        kind = item.get("type")
        try:
            if kind == "reminder":
                text, j = create_reminder(vault, tz, _reminder_from_item(item, now), now, hint=False)
                lines.append(text)
                data["reminders"].append(j)
            elif kind == "task":
                text = str(item.get("text") or "").strip()
                if not text:
                    raise ValueError("task without text")
                due = date.fromisoformat(item["due"][:10]) if item.get("due") else None
                priority = item.get("priority") if item.get("priority") in ("high", "medium", "low") else None
                x = writer.add_task(vault, text[:300], due=due, priority=priority)
                due_text = t("capture.task_due", date=date_long(x.due)) if x.due else ""
                lines.append(t("capture.task", text=x.text, due=due_text))
                data["tasks"].append(task_dict(x))
            elif kind == "note":
                text = str(item.get("text") or "").strip()
                if not text:
                    raise ValueError("note without text")
                path = writer.save_raw(vault, text, now, source)
                rel = path.relative_to(vault).as_posix()
                lines.append(t("capture.note", path=rel))
                data["notes"].append(rel)
            elif kind == "event":
                e = proposals.normalize(item)
                p = proposals.create(e, request, source)
                lines.append(t("capture.event", event=describe_event(e)))
                data["proposals"].append({"id": p.id, "event": p.event.__dict__, "status": p.status})
            else:
                raise ValueError(f"unknown type: {kind}")
        except (ValueError, KeyError, TypeError, proposals.InvalidProposal, reminders.InvalidReminder) as e:
            data["errors"].append(f"{kind}: {e}")
            lines.append(t("capture.failed", type=kind, error=e))
    if data["reminders"]:
        lines[-1] += _no_devices()
    return "\n".join(lines) or t("capture.nothing"), {k: v for k, v in data.items() if v}
