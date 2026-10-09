"""Short-term memory: what is true for a few days and then stops mattering.

"Looking for a birthday present for their mother" helps every conversation this week, but would be noise in
`wiki/about-me/learned.md` a month from now. Tier 2 (and Tier 3 sessions) keep such facts in `life/recent.md`,
one line each with the day it stops counting:

    - Looking for a birthday present for their mother (2026-10-08 → 2026-10-15)

Lines past their date are dropped whenever the file is read (every Tier 2 request reads it), so the file
cleans itself without a routine. Mentioning the same fact again renews it; `replaces` drops a line that
stopped being true ("I already bought it").
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from app.memory import writer
from app.memory.reader import read_text

RECENT = "life/recent.md"
MAX_DAYS = 7
LINE_RE = re.compile(r"^- (?P<fact>.+?) \((?P<start>\d{4}-\d{2}-\d{2}) → (?P<end>\d{4}-\d{2}-\d{2})\)\s*$")
HEADER = (
    "---\n"
    "type: recent\n"
    "---\n"
    "# Recent\n\n"
    "Short-term memory: what matters for a few days (one line per fact, with the day it stops counting). "
    "Lines past their date are removed automatically.\n"
)


@dataclass
class Fact:
    fact: str
    start: date
    end: date


def _norm(text: str) -> str:
    from app.memory.learn import _norm as norm

    return norm(text)


def _parse(text: str) -> tuple[list[str], list[Fact]]:
    """(lines before the list, facts)."""
    head: list[str] = []
    facts: list[Fact] = []
    for line in text.splitlines():
        if m := LINE_RE.match(line.strip()):
            try:
                facts.append(Fact(m.group("fact"), date.fromisoformat(m.group("start")), date.fromisoformat(m.group("end"))))
            except ValueError:
                continue
        elif not facts:
            head.append(line)
    return head, facts


def _write(memory: Path, head: list[str], facts: list[Fact]) -> None:
    body = "\n".join(head).rstrip("\n") if any(x.strip() for x in head) else HEADER.rstrip("\n")
    lines = [f"- {f.fact} ({f.start.isoformat()} → {f.end.isoformat()})" for f in facts]
    writer.write_atomic(memory / RECENT, body + "\n\n" + "\n".join(lines) + ("\n" if lines else ""))


def facts(memory: Path, today: date) -> list[Fact]:
    """The facts still valid today, oldest first. Expired ones are removed from the file along the way."""
    text = read_text(memory / RECENT)
    if not text:
        return []
    head, items = _parse(text)
    valid = [f for f in items if f.end >= today]
    if len(valid) < len(items):
        try:
            _write(memory, head, valid)
        except OSError:
            pass  # cleaning is a convenience: the expired lines are already left out
    return valid


def add(memory: Path, fact: str, now: datetime, days: int | None = None, replaces: str | None = None) -> tuple[bool, str | None]:
    """Keeps a fact for `days` (1–7). The same fact again renews its date. Returns (written, replaced fact)."""
    today = now.date()
    days = max(1, min(MAX_DAYS, int(days or MAX_DAYS)))
    head, items = _parse(read_text(memory / RECENT) or "")
    items = [f for f in items if f.end >= today]
    replaced = None
    if replaces and _norm(replaces):
        for f in items:
            if _norm(replaces) in _norm(f.fact):
                replaced = f.fact
                items.remove(f)
                break
    key = _norm(fact)
    end = today + timedelta(days=days)
    for f in items:
        if _norm(f.fact) == key:
            if f.end >= end and not replaced:
                return False, None
            f.end = max(f.end, end)
            _write(memory, head, items)
            return True, replaced
    items.append(Fact(fact, today, end))
    _write(memory, head, items)
    return True, replaced


def context(memory: Path, today: date) -> str:
    """The section for Tier 2's context (empty when there is nothing)."""
    items = facts(memory, today)
    if not items:
        return ""
    lines = [f"- {f.fact} (since {f.start.isoformat()}, until {f.end.isoformat()})" for f in items]
    return "## Recent (short-term memory, the next few days)\n" + "\n".join(lines)
