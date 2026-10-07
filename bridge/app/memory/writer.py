"""Writing to the memory: tasks and captures in raw/. Atomic writes (temporary file + replace)."""

import os
import re
import tempfile
import time
import unicodedata
from datetime import date, datetime
from pathlib import Path
from types import EllipsisType

from app.locales import t
from app.memory.reader import TASKS, read_text
from app.memory.tasks import Priority, Task, format_task, parse_tasks, set_done


class TaskNotFound(Exception):
    pass


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        # On Windows the replace fails if another program (an editor, antivirus, sync) has the file
        # open at that instant; retry a few times.
        for attempt in range(5):
            try:
                os.replace(tmp, path)
                break
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.05)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def slugify(text: str, max_len: int = 50) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug[:max_len].rstrip("-") or "untitled"


def add_task(
    memory: Path,
    text: str,
    *,
    due: date | None = None,
    priority: Priority | None = None,
    tags: list[str] | None = None,
) -> Task:
    path = memory / TASKS
    current = read_text(path) or t("file.tasks_header")
    if not current.endswith("\n"):
        current += "\n"
    line = format_task(text, due=due, priority=priority, tags=tags)
    write_atomic(path, current + line + "\n")
    return parse_tasks(current + line + "\n")[-1]


def update_task(
    memory: Path,
    task_id: str,
    today: date,
    *,
    done: bool | None = None,
    text: str | None = None,
    due: date | None | EllipsisType = ...,
    priority: Priority | None | EllipsisType = ...,
) -> Task:
    """Updates a task by id. Only checking/unchecking keeps the original line;
    changing text, due date or priority rewrites the line in the standard format."""
    path = memory / TASKS
    content = read_text(path)
    task = next((x for x in parse_tasks(content) if x.id == task_id), None)
    if task is None:
        raise TaskNotFound(task_id)

    lines = content.split("\n")
    line = lines[task.line]
    crlf = line.endswith("\r")
    line = line.rstrip("\r")
    if text is not None or due is not ... or priority is not ...:
        indent = line[: len(line) - len(line.lstrip())]
        line = indent + format_task(
            text if text is not None else task.text,
            done=task.done,
            due=task.due if due is ... else due,
            priority=task.priority if priority is ... else priority,
            tags=task.tags,
            done_on=task.done_on,
        )
    if done is not None and done != task.done:
        line = set_done(line, done, today)

    lines[task.line] = line + ("\r" if crlf else "")
    new = "\n".join(lines)
    write_atomic(path, new)
    return next(x for x in parse_tasks(new) if x.line == task.line)


def save_raw(memory: Path, text: str, now: datetime, source: str, title: str | None = None, kind: str = "capture") -> Path:
    """Quick capture: a new file in raw/ (never overwrites). `kind`: capture, or answer (a chat answer to keep)."""
    title = title or text.strip().splitlines()[0][:60]
    base = f"{now:%Y-%m-%d-%H%M%S}-{slugify(title)}"
    folder = memory / "raw"
    path = folder / f"{base}.md"
    n = 2
    while path.exists():
        path = folder / f"{base}-{n}.md"
        n += 1
    content = (
        "---\n"
        f"type: {kind}\n"
        f"created: {now.isoformat(timespec='seconds')}\n"
        f"source: {source}\n"
        "---\n"
        f"{text.strip()}\n"
    )
    write_atomic(path, content)
    return path


def save_raw_file(memory: Path, name: str, data: bytes, now: datetime) -> Path:
    """Upload to raw/ keeping the extension; prefixed with the date so it never collides."""
    stem, ext = os.path.splitext(Path(name).name)
    path = memory / "raw" / f"{now:%Y-%m-%d-%H%M%S}-{slugify(stem)}{ext.lower()}"
    n = 2
    while path.exists():
        path = path.with_name(f"{now:%Y-%m-%d-%H%M%S}-{slugify(stem)}-{n}{ext.lower()}")
        n += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path
