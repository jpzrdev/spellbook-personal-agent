"""Routine status: today's runs (receipts + sessions in progress) and history."""

from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from app import cron
from app.gandalf import tier3
from app.receipts_index import read_receipts
from app.memory.reader import read_routines

# A run counts for a scheduled time if it started up to 2 min before it (clocks, delays).
TOLERANCE = timedelta(minutes=2)


def runs(memory: Path, start: datetime, end: datetime) -> dict[str, list[dict]]:
    """Per slug: runs (receipts with `routine` + still-active sessions), oldest to newest."""
    by_slug: dict[str, list[dict]] = {}
    for r in read_receipts(memory, start.date(), end.date()):
        if r["routine"] and r["at"] and start <= r["at"] <= end:
            by_slug.setdefault(r["routine"], []).append(
                {"at": r["at"], "status": r["status"], "receipt_id": r["id"], "tier": r["tier"]}
            )
    for s in tier3.manager(memory).sessions():
        if s.routine and s.status in tier3.ACTIVE:
            by_slug.setdefault(s.routine, []).append(
                {"at": s.created, "status": s.status, "session_id": s.id}
            )
    for items in by_slug.values():
        items.sort(key=lambda e: e["at"])
    return by_slug


def routines_today(memory: Path, now: datetime, tz: ZoneInfo) -> list[dict]:
    """Today's fire times of the active routines with a status: pending | missed | queued | running | ok | error…"""
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    done = runs(memory, day_start, now + timedelta(days=1))
    items: list[dict] = []
    for r in read_routines(memory):
        if not r.active:
            continue
        try:
            fires = cron.times_in_day(r.cron, now.date(), tz)
        except ValueError:
            continue
        executions = done.get(r.slug, [])
        for i, d in enumerate(fires):
            following = fires[i + 1] if i + 1 < len(fires) else day_start + timedelta(days=2)
            # The run for this time: the first one between (time − tolerance) and the next time.
            run = next((e for e in executions if d - TOLERANCE <= e["at"] < following - TOLERANCE), None)
            status = run["status"] if run else ("pending" if d > now else "missed")
            item = {"slug": r.slug, "name": r.name, "time": d.strftime("%H:%M"), "schedule": r.schedule, "status": status}
            if run:
                item.update({k: run[k] for k in ("receipt_id", "session_id") if k in run})
            items.append(item)
    return sorted(items, key=lambda i: i["time"])


def history(memory: Path, now: datetime, days: int = 30) -> dict[str, list[dict]]:
    return runs(memory, now - timedelta(days=days), now + timedelta(minutes=1))
