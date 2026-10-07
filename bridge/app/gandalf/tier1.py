"""Gandalf's Tier 1: rule-based intents answered straight from the memory. No network, no AI.

The rules (regexes) and the replies come from the user's language (`app.locales`).
"""

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from app import locales
from app.config import get_settings
from app.locales import t
from app.memory import reader, writer
from app.memory.tasks import Priority, Task, sort_by_priority


@dataclass
class Context:
    memory: Path
    now: datetime
    tz: ZoneInfo
    source: str = "hud"

    @property
    def today(self) -> date:
        return self.now.date()


@dataclass
class Reply:
    intent: str
    text: str
    data: dict = field(default_factory=dict)


def normalize(text: str) -> str:
    """Lowercase, no accents and no trailing punctuation, to match regexes loosely."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", ascii_text.lower()).strip(" ?!.")


def date_long(d: date) -> str:
    return locales.date_long(d)


# ---------- dates and priority in free text ----------

DATE_SLASH_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b")
DATE_ISO_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")


def extract_date(text_norm: str, today: date) -> tuple[date | None, str]:
    """Finds a date in the normalized text and returns (date, text without the expression)."""
    loc = locales.current()
    patterns: list[tuple[str, Callable[[re.Match], date]]] = [
        (pattern, lambda m, days=days: today + timedelta(days=days)) for pattern, days in loc.RELATIVE_DAYS
    ]
    for i, day in enumerate(loc.WEEKDAYS_NORM):
        def upcoming(m, i=i):
            delta = (i - today.weekday()) % 7 or 7
            return today + timedelta(days=delta)
        patterns.append((loc.weekday_pattern(day), upcoming))

    for pattern, compute in patterns:
        if m := re.search(pattern, text_norm):
            return compute(m), (text_norm[: m.start()] + text_norm[m.end():])
    if m := DATE_ISO_RE.search(text_norm):
        return date.fromisoformat(m.group(1)), text_norm.replace(m.group(0), "")
    if m := DATE_SLASH_RE.search(text_norm):
        first, second, year = int(m.group(1)), int(m.group(2)), m.group(3)
        day, month = (first, second) if loc.DAY_FIRST else (second, first)
        year_i = int(year) + (2000 if year and len(year) == 2 else 0) if year else today.year
        try:
            d = date(year_i, month, day)
        except ValueError:
            return None, text_norm
        if not year and d < today:
            d = d.replace(year=d.year + 1)
        return d, text_norm.replace(m.group(0), "")
    return None, text_norm


def _strip_connectors(text: str) -> str:
    text = locales.current().TRAILING_WORDS_RE.sub("", text.strip())
    return re.sub(r"\s{2,}", " ", text).strip(" ,:-")


# ---------- intents ----------

def _format_events(events: list[reader.AgendaEvent]) -> list[str]:
    lines = []
    for e in events:
        if e.start:
            hour = f"{e.start}–{e.end}" if e.end else e.start
        else:
            hour = t("all_day")
        location = f" ({e.location})" if e.location else ""
        lines.append(f"- {hour} {e.title}{location}")
    return lines


def task_dict(x: Task) -> dict:
    return {
        "id": x.id,
        "text": x.text,
        "done": x.done,
        "due": x.due.isoformat() if x.due else None,
        "done_on": x.done_on.isoformat() if x.done_on else None,
        "priority": x.priority,
        "tags": x.tags,
    }


def _format_task(x: Task, today: date) -> str:
    short = locales.current().short_date
    extra = []
    if x.due:
        if x.due < today:
            extra.append(t("task.overdue_since", date=short(x.due)))
        elif x.due == today:
            extra.append(t("task.due_today"))
        else:
            extra.append(t("task.due_by", date=short(x.due)))
    if x.priority in ("highest", "high"):
        extra.append(t("task.high_priority"))
    return f"- {x.text}" + (f" ({', '.join(extra)})" if extra else "")


def intent_agenda(ctx: Context, m: re.Match) -> Reply:
    tomorrow = bool(m.group("when")) and locales.current().TOMORROW_WORD in m.group("when")
    day = ctx.today + timedelta(days=1) if tomorrow else ctx.today
    label = t("tomorrow") if tomorrow else t("today")
    events = reader.read_agenda(ctx.memory, day)
    tasks = [x for x in sort_by_priority(reader.read_tasks(ctx.memory), day) if x.due and x.due <= day]

    lines = [t("agenda.title", label=label.capitalize(), date=date_long(day))]
    lines += _format_events(events) if events else [t("agenda.empty")]
    if tasks:
        lines += ["", t("agenda.tasks_for", label=label)] + [_format_task(x, ctx.today) for x in tasks]
    return Reply(
        "agenda",
        "\n".join(lines),
        {"date": day.isoformat(), "events": [e.__dict__ for e in events], "tasks": [task_dict(x) for x in tasks]},
    )


def intent_priorities(ctx: Context, m: re.Match) -> Reply:
    top = sort_by_priority(reader.read_tasks(ctx.memory), ctx.today)[:3]
    if not top:
        return Reply("priorities", t("priorities.none"), {"tasks": []})
    lines = [t("priorities.title")] + [_format_task(x, ctx.today) for x in top]
    return Reply("priorities", "\n".join(lines), {"tasks": [task_dict(x) for x in top]})


def intent_tasks(ctx: Context, m: re.Match) -> Reply:
    open_tasks = sort_by_priority(reader.read_tasks(ctx.memory), ctx.today)
    if not open_tasks:
        return Reply("tasks", t("priorities.none"), {"tasks": []})
    shown = open_tasks[:10]
    lines = [t("tasks.title", count=len(open_tasks))] + [_format_task(x, ctx.today) for x in shown]
    if len(open_tasks) > len(shown):
        lines.append(t("tasks.more", count=len(open_tasks) - len(shown)))
    return Reply("tasks", "\n".join(lines), {"tasks": [task_dict(x) for x in open_tasks]})


def intent_add_task(ctx: Context, m: re.Match) -> Reply:
    original = m.group("rest")
    # We work on the normalized text only to find date/priority; the saved text keeps its accents.
    norm = normalize(original)
    due, without_date = extract_date(norm, ctx.today)
    priority: Priority | None = None
    high = locales.current().HIGH_PRIORITY_RE
    if high.search(without_date):
        priority = "high"
        without_date = high.sub("", without_date)
    tags = re.findall(r"#([\w/-]+)", original)

    # Recover the accented text: drop from the original the same words that left the normalized one.
    kept_words = set(_strip_connectors(re.sub(r"#[\w/-]+", "", without_date)).split())
    text = " ".join(
        w for w in re.sub(r"#[\w/-]+", "", original).split() if normalize(w) in kept_words
    )
    text = _strip_connectors(text) or original.strip()

    task = writer.add_task(ctx.memory, text, due=due, priority=priority, tags=tags)
    due_text = t("task.added_due", date=locales.current().short_date(task.due)) if task.due else ""
    return Reply("add_task", t("task.added", due=due_text, text=task.text), {"task": task_dict(task)})


def intent_note(ctx: Context, m: re.Match) -> Reply | None:
    text = m.group("rest").strip()
    if locales.current().DATE_HINT_RE.search(normalize(text)):
        return None
    path = writer.save_raw(ctx.memory, text, ctx.now, ctx.source)
    rel = path.relative_to(ctx.memory).as_posix()
    return Reply("note", t("note.saved", path=rel), {"file": rel})


def intent_reminders(ctx: Context, m: re.Match) -> Reply:
    from app.gandalf.triage import describe_recurrence, describe_when
    from app.reminders import reminder_json
    from app.memory import reminders

    pending = [x for x in reminders.read(ctx.memory, ctx.tz) if not x.done]
    if not pending:
        return Reply("reminders", t("reminders.none"), {"reminders": []})
    one_off = sorted((x for x in pending if x.when), key=lambda x: x.when)
    recurring = [x for x in pending if x.recurring]
    lines = [t("reminders.title")]
    lines += [f"- {describe_when(x.when, ctx.now)}: {x.text}" for x in one_off]
    lines += [f"- {describe_recurrence(x.recurrence)}: {x.text}" for x in recurring]
    return Reply("reminders", "\n".join(lines), {"reminders": [reminder_json(x) for x in one_off + recurring]})


def intent_routines(ctx: Context, m: re.Match) -> Reply:
    from app import cron

    routines = reader.read_routines(ctx.memory)
    if not routines:
        return Reply("routines", t("routines.none"), {"routines": []})
    language = get_settings().language
    lines = [t("routines.title")] + [
        f"- {r.name}: {cron.describe(r.cron, language)} ({t('routine.active') if r.active else t('routine.paused')})"
        for r in routines
    ]
    return Reply("routines", "\n".join(lines), {"routines": [r.__dict__ for r in routines]})


HANDLERS: dict[str, Callable[[Context, re.Match], Reply | None]] = {
    "add_task": intent_add_task,
    "note": intent_note,
    "reminders": intent_reminders,
    "agenda": intent_agenda,
    "priorities": intent_priorities,
    "tasks": intent_tasks,
    "routines": intent_routines,
}


def answer(text: str, ctx: Context) -> Reply | None:
    """Tries to match the request with an intent. None = not Tier 1."""
    from app.gandalf import triage

    if reminder := triage.parse_reminder(text, ctx.now):
        reply, data = triage.create_reminder(ctx.memory, ctx.tz, reminder, ctx.now)
        return Reply("reminder", reply, {"reminders": [data]})
    norm = normalize(text)
    for intent, pattern in locales.current().INTENTS:
        m = re.match(pattern, norm)
        if not m:
            continue
        if "rest" in m.re.groupindex:
            # Cut "rest" from the original text (same final length, since we only removed accents).
            m = _OriginalMatch(m, text, norm)
        if (r := HANDLERS[intent](ctx, m)) is not None:  # a handler may decline (e.g. a note with a date)
            return r
    return None


class _OriginalMatch:
    """Makes `group('rest')` return the excerpt with the original accents/capitals."""

    def __init__(self, m: re.Match, original: str, norm: str):
        self._m = m
        norm_words = norm.split()
        original_words = re.sub(r"\s+", " ", original.strip()).rstrip(" ?!.").split()
        start = len(norm[: m.start("rest")].split())
        self._rest = " ".join(original_words[start:]) if len(original_words) == len(norm_words) else m.group("rest")

    def group(self, name):
        return self._rest if name == "rest" else self._m.group(name)
