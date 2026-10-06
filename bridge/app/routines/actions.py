"""Internal actions (Tier 1, no AI) that a routine can call with `action: <name>`."""

import os
import subprocess
from collections.abc import Callable
from datetime import datetime
from pathlib import Path


class ActionFailed(Exception):
    pass


def _git(vault: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=vault,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def git_commit(vault: Path, now: datetime) -> str:
    """Commits everything that changed in the vault (so any change can be undone)."""
    if not (vault / ".git").exists():
        raise ActionFailed("the vault has no git repository (run `git init` inside vault/)")
    _git(vault, "add", "-A")
    if not _git(vault, "status", "--porcelain").stdout.strip():
        return "Nothing changed in the vault since the last commit."
    changes = _git(vault, "diff", "--cached", "--name-only").stdout.split()
    r = _git(vault, "commit", "-m", f"Daily commit {now:%Y-%m-%d %H:%M}")
    if r.returncode != 0:
        raise ActionFailed((r.stderr or r.stdout).strip()[-400:])
    listed = "\n".join(f"- `{m}`" for m in changes[:20])
    extra = f"\n…and {len(changes) - 20} more." if len(changes) > 20 else ""
    return f"Committed {len(changes)} file(s):\n{listed}{extra}"


def daily_notice(vault: Path, now: datetime) -> str:
    """Morning notification: appointments (from the synced agenda), birthdays, tasks and today's reminders."""
    from app import push
    from app.vault import reader, reminders
    from app.vault.tasks import sort_by_priority

    day = now.date()
    events = reader.read_agenda(vault, day)
    birthdays = [e.title for e in events if "anivers" in e.title.lower() or "birthday" in e.title.lower()]
    appointments = [e for e in events if e.title not in birthdays]
    open_tasks = sort_by_priority(reader.read_tasks(vault), day)
    due_today = [x for x in open_tasks if x.due and x.due <= day]
    overdue = sum(1 for x in due_today if x.due < day)
    alerts = [x for x in reminders.read(vault, now.tzinfo) if not x.done and x.when and x.when.date() == day]

    parts = []
    if birthdays:
        parts.append("🎂 " + ", ".join(birthdays))
    if appointments:
        first = next((e for e in appointments if e.start), appointments[0])
        more = f" +{len(appointments) - 1}" if len(appointments) > 1 else ""
        parts.append(f"📅 {first.start or 'all day'} {first.title}{more}")
    if due_today:
        parts.append(f"✅ {len(due_today)} task(s)" + (f" ({overdue} overdue)" if overdue else ""))
    if alerts:
        parts.append(f"⏰ {len(alerts)} reminder(s)")
    body = " · ".join(parts) or "A free day: nothing on the calendar and no tasks due. 🌱"
    sent = push.send(push.Notification("☀️ Good morning! Your day today", body, "/", tag="daily-notice"))
    return f"{body}\n\n(notification sent to {sent} device[s])"


ACTIONS: dict[str, tuple[str, Callable[[Path, datetime], str]]] = {
    "git-commit": ("Commit everything that changed in the vault to git", git_commit),
    "daily-notice": ("Phone notification with the day's summary (agenda, birthdays, tasks, reminders)", daily_notice),
}
