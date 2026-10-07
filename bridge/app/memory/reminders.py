"""Gandalf's reminders in `life/reminders.md` (editable in the HUD's Memory tab).

One line per reminder:
- one-off:   `- [ ] Take the laundry out ⏰ 2026-10-03 18:30 🆔 k3j9x2`
- recurring: `- [ ] Take medicine 🔁 0 22 * * * 🆔 a8d7f1` (cron: min hour day month day-of-week)

A one-off reminder becomes `[x]` (with `✅ date time`) after it fires. Checking `[x]` on a recurring one pauses it.
"""

import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.locales import t
from app.memory.reader import read_text
from app.memory.writer import write_atomic

REMINDERS = Path("life/reminders.md")

LINE_RE = re.compile(r"^(?P<indent>\s*)[-*] \[(?P<mark>[ xX])\] (?P<body>.*)$")
WHEN_RE = re.compile(r"\s*⏰\s*(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})")
DONE_RE = re.compile(r"\s*✅\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?")
RECURRENCE_RE = re.compile(r"\s*🔁\s*((?:\S+\s+){4}\S+)")
ID_RE = re.compile(r"\s*🆔\s*([\w-]+)")


@dataclass
class Reminder:
    id: str
    line: int
    text: str
    done: bool
    when: datetime | None = None
    recurrence: str | None = None
    done_at: datetime | None = None

    @property
    def recurring(self) -> bool:
        return self.recurrence is not None


class ReminderNotFound(Exception):
    pass


class InvalidReminder(ValueError):
    pass


def new_id() -> str:
    return secrets.token_hex(3)


def _datetime(d: str, h: str, tz: ZoneInfo) -> datetime:
    return datetime.fromisoformat(f"{d}T{int(h.split(':')[0]):02d}:{h.split(':')[1]}").replace(tzinfo=tz)


def parse(content: str, tz: ZoneInfo) -> list[Reminder]:
    items = []
    for i, line in enumerate(content.splitlines()):
        m = LINE_RE.match(line)
        if not m:
            continue
        body = m.group("body")
        w = WHEN_RE.search(body)
        r = RECURRENCE_RE.search(body)
        if not w and not r:
            continue  # checklist line without a time: not a reminder
        d = DONE_RE.search(body)
        ident = ID_RE.search(body)
        text = body
        for pattern in (WHEN_RE, DONE_RE, RECURRENCE_RE, ID_RE):
            text = pattern.sub("", text)
        try:
            when = _datetime(w.group(1), w.group(2), tz) if w else None
            done_at = _datetime(d.group(1), d.group(2) or "00:00", tz) if d else None
        except ValueError:
            continue
        items.append(
            Reminder(
                # No 🆔 (written by hand): stable id from the position, until the Bridge writes one.
                id=ident.group(1) if ident else f"l{i}",
                line=i,
                text=text.strip(),
                done=m.group("mark") != " ",
                when=when,
                recurrence=r.group(1).strip() if r else None,
                done_at=done_at,
            )
        )
    return items


def format_reminder(reminder: Reminder) -> str:
    parts = [f"- [{'x' if reminder.done else ' '}] {reminder.text.strip()}"]
    if reminder.when:
        parts.append(f"⏰ {reminder.when:%Y-%m-%d %H:%M}")
    if reminder.recurrence:
        parts.append(f"🔁 {reminder.recurrence}")
    if reminder.done and reminder.done_at:
        parts.append(f"✅ {reminder.done_at:%Y-%m-%d %H:%M}")
    parts.append(f"🆔 {reminder.id}")
    return " ".join(parts)


def read(memory: Path, tz: ZoneInfo) -> list[Reminder]:
    return parse(read_text(memory / REMINDERS), tz)


def _validate(text: str, when: datetime | None, recurrence: str | None, tz: ZoneInfo) -> None:
    from app import cron

    if not text.strip():
        raise InvalidReminder("a reminder needs some text")
    if bool(when) == bool(recurrence):
        raise InvalidReminder("give a time (⏰) or a recurrence (🔁), not both")
    if recurrence:
        try:
            cron.create_trigger(recurrence, tz)
        except (ValueError, TypeError) as e:
            raise InvalidReminder(f"invalid recurrence: {recurrence!r}") from e
    if any(s in text for s in ("⏰", "🔁", "✅", "🆔", "\n")):
        raise InvalidReminder("the text cannot contain the markers ⏰ 🔁 ✅ 🆔 or a line break")


def add(memory: Path, tz: ZoneInfo, text: str, *, when: datetime | None = None, recurrence: str | None = None) -> Reminder:
    text = text.strip()
    _validate(text, when, recurrence, tz)
    path = memory / REMINDERS
    current = read_text(path) or t("file.reminders_header")
    if not current.endswith("\n"):
        current += "\n"
    new = Reminder(
        id=new_id(), line=-1, text=text, done=False,
        when=when.astimezone(tz) if when else None, recurrence=recurrence,
    )
    write_atomic(path, current + format_reminder(new) + "\n")
    return next(x for x in read(memory, tz) if x.id == new.id)


def _rewrite(memory: Path, tz: ZoneInfo, reminder_id: str, change) -> Reminder | None:
    path = memory / REMINDERS
    content = read_text(path)
    target = next((x for x in parse(content, tz) if x.id == reminder_id), None)
    if target is None:
        raise ReminderNotFound(reminder_id)
    lines = content.split("\n")
    crlf = lines[target.line].endswith("\r")
    indent = LINE_RE.match(lines[target.line].rstrip("\r")).group("indent")
    if target.id.startswith("l") and not ID_RE.search(lines[target.line]):
        target.id = new_id()  # a handwritten reminder gets a real id
    new = change(target)
    if new is None:
        del lines[target.line]
    else:
        _validate(new.text, new.when, new.recurrence, tz)
        lines[target.line] = indent + format_reminder(new) + ("\r" if crlf else "")
    write_atomic(path, "\n".join(lines))
    return new


def update(
    memory: Path,
    tz: ZoneInfo,
    reminder_id: str,
    *,
    done: bool | None = None,
    text: str | None = None,
    when: datetime | None = None,
    now: datetime | None = None,
) -> Reminder:
    """Completes/reopens, changes the text or reschedules (rescheduling a one-off also reopens it)."""

    def change(x: Reminder) -> Reminder:
        if text is not None:
            x.text = text.strip()
        if when is not None:
            if x.recurring:
                raise InvalidReminder("a recurring reminder has no single time to reschedule")
            x.when = when.astimezone(tz)
            x.done, x.done_at = False, None
        if done is not None:
            x.done = done
            x.done_at = (now or datetime.now(tz)) if done else None
        return x

    return _rewrite(memory, tz, reminder_id, change)


def remove(memory: Path, tz: ZoneInfo, reminder_id: str) -> None:
    _rewrite(memory, tz, reminder_id, lambda x: None)
