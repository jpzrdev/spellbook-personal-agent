"""Tasks in the Obsidian Tasks plugin format.

Example line: `- [ ] Calculus problem set 3 📅 2026-10-06 ⏫ #studies/calculus`

A task id is a hash of its content without the checkbox and without the done date (✅),
so it does not change when checking/unchecking and survives edits to other lines of the file.
"""

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

Priority = Literal["highest", "high", "medium", "low", "lowest"]

PRIORITY_EMOJI: dict[Priority, str] = {
    "highest": "🔺",
    "high": "⏫",
    "medium": "🔼",
    "low": "🔽",
    "lowest": "⏬",
}
EMOJI_PRIORITY = {v: k for k, v in PRIORITY_EMOJI.items()}
PRIORITY_WEIGHT: dict[Priority | None, int] = {
    "highest": 0,
    "high": 1,
    "medium": 2,
    None: 3,
    "low": 4,
    "lowest": 5,
}

LINE_RE = re.compile(r"^(?P<indent>\s*)[-*] \[(?P<mark>[ xX])\] (?P<body>.*)$")
DATE_RE = r"(\d{4}-\d{2}-\d{2})"
DUE_RE = re.compile(r"\s*📅\s*" + DATE_RE)
DONE_RE = re.compile(r"\s*✅\s*" + DATE_RE)
OTHER_DATES_RE = re.compile(r"\s*[⏳🛫➕]\s*" + DATE_RE)
PRIORITY_RE = re.compile(r"\s*(" + "|".join(PRIORITY_EMOJI.values()) + r")")
TAG_RE = re.compile(r"(?<!\S)#([\w/-]+)")


@dataclass
class Task:
    id: str
    line: int
    text: str
    done: bool
    due: date | None = None
    done_on: date | None = None
    priority: Priority | None = None
    tags: list[str] = field(default_factory=list)


def _body_without_done(body: str) -> str:
    return DONE_RE.sub("", body).strip()


def task_id(body: str, occurrence: int = 0) -> str:
    base = _body_without_done(body)
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:10]
    return digest if occurrence == 0 else f"{digest}-{occurrence}"


def parse_body(body: str) -> dict:
    """Extracts due date, priority, tags and the clean text from a task body."""
    due = DUE_RE.search(body)
    done_on = DONE_RE.search(body)
    priority = PRIORITY_RE.search(body)
    tags = TAG_RE.findall(body)

    text = body
    for regex in (DUE_RE, DONE_RE, OTHER_DATES_RE, PRIORITY_RE):
        text = regex.sub("", text)
    text = TAG_RE.sub("", text)
    text = re.sub(r"\s{2,}", " ", text).strip()

    return {
        "text": text,
        "due": date.fromisoformat(due.group(1)) if due else None,
        "done_on": date.fromisoformat(done_on.group(1)) if done_on else None,
        "priority": EMOJI_PRIORITY[priority.group(1)] if priority else None,
        "tags": tags,
    }


def parse_tasks(content: str) -> list[Task]:
    tasks: list[Task] = []
    seen: dict[str, int] = {}
    # split("\n") and not splitlines(), so line indexes match the writer.
    for i, line in enumerate(content.split("\n")):
        m = LINE_RE.match(line.rstrip("\r"))
        if not m:
            continue
        body = m.group("body")
        base = task_id(body)
        occurrence = seen.get(base, 0)
        seen[base] = occurrence + 1
        tasks.append(
            Task(
                id=task_id(body, occurrence),
                line=i,
                done=m.group("mark") != " ",
                **parse_body(body),
            )
        )
    return tasks


def format_task(
    text: str,
    *,
    done: bool = False,
    due: date | None = None,
    priority: Priority | None = None,
    tags: list[str] | None = None,
    done_on: date | None = None,
) -> str:
    parts = [f"- [{'x' if done else ' '}] {text.strip()}"]
    if due:
        parts.append(f"📅 {due.isoformat()}")
    if priority:
        parts.append(PRIORITY_EMOJI[priority])
    parts.extend(f"#{t}" for t in tags or [])
    if done and done_on:
        parts.append(f"✅ {done_on.isoformat()}")
    return " ".join(parts)


def set_done(line: str, done: bool, today: date) -> str:
    """Checks/unchecks keeping the rest of the line as the user wrote it."""
    m = LINE_RE.match(line)
    if not m:
        raise ValueError("line is not a task")
    body = DONE_RE.sub("", m.group("body")).rstrip()
    if done:
        body = f"{body} ✅ {today.isoformat()}"
    return f"{m.group('indent')}- [{'x' if done else ' '}] {body}"


def sort_by_priority(tasks: list[Task], today: date) -> list[Task]:
    """Open tasks: overdue/due today first; then priority; then due date."""

    def key(t: Task):
        group = 0 if t.due and t.due <= today else 1
        return (group, PRIORITY_WEIGHT[t.priority], t.due or date.max, t.line)

    return sorted((t for t in tasks if not t.done), key=key)
