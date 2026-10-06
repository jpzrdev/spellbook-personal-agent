"""Reading the vault: tasks, agenda and routines. Files only, no network and no AI."""

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import frontmatter

from app import cron
from app.vault.tasks import Task, parse_tasks

TASKS = Path("life/tasks.md")
AGENDA = Path("life/agenda")
ROUTINES = Path("life/routines")

# "- 09:00–10:30 Calculus II lecture (Room 204)" or "- 14:00 Dentist" or "- All day: holiday"
EVENT_RE = re.compile(
    r"^[-*]\s+(?:(?P<start>\d{1,2}:\d{2})(?:\s*[–-]\s*(?P<end>\d{1,2}:\d{2}))?\s+)?(?P<title>.+?)\s*$"
)
LOCATION_RE = re.compile(r"\s*\((?P<location>[^()]+)\)\s*$")


@dataclass
class AgendaEvent:
    start: str | None
    end: str | None
    title: str
    location: str | None


@dataclass
class Routine:
    slug: str
    name: str
    cron: str
    schedule: str
    active: bool
    tier: int
    skill: str | None
    action: str | None
    description: str
    output: str = "vault"  # vault | ephemeral
    notify: bool = False  # phone push when it finishes fine (failures always notify)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def read_tasks(vault: Path) -> list[Task]:
    return parse_tasks(read_text(vault / TASKS))


def _hour(h: str | None) -> str | None:
    if not h:
        return None
    hh, mm = h.split(":")
    return f"{int(hh):02d}:{mm}"


def read_agenda(vault: Path, day: date) -> list[AgendaEvent]:
    path = vault / AGENDA / f"{day.isoformat()}.md"
    if not path.is_file():
        return []
    events: list[AgendaEvent] = []
    for line in frontmatter.loads(read_text(path)).content.splitlines():
        m = EVENT_RE.match(line.strip())
        if not m:
            continue
        title = m.group("title")
        location = None
        if lm := LOCATION_RE.search(title):
            location = lm.group("location")
            title = title[: lm.start()]
        events.append(AgendaEvent(_hour(m.group("start")), _hour(m.group("end")), title.strip(), location))
    # All-day events (no time) first, then by time.
    return sorted(events, key=lambda e: (e.start is not None, e.start or ""))


def read_routines(vault: Path) -> list[Routine]:
    folder = vault / ROUTINES
    if not folder.is_dir():
        return []
    routines: list[Routine] = []
    for path in sorted(folder.glob("*.md")):
        post = frontmatter.loads(read_text(path))
        meta = post.metadata
        if meta.get("type") != "routine" or not meta.get("cron"):
            continue
        expr = str(meta["cron"])
        routines.append(
            Routine(
                slug=path.stem,
                name=str(meta.get("name") or path.stem),
                cron=expr,
                schedule=cron.describe(expr),
                active=bool(meta.get("active", False)),
                tier=int(meta.get("tier", 3)),
                skill=meta.get("skill") or None,
                action=meta.get("action") or None,
                description=post.content.strip(),
                output="ephemeral" if meta.get("output") == "ephemeral" else "vault",
                notify=bool(meta.get("notify", False)),
            )
        )
    return routines
