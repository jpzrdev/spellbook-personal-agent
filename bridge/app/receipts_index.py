"""Reading receipts (frontmatter only) for history, last run and status."""

import re
from datetime import date, datetime
from pathlib import Path

import frontmatter

from app.receipts import RECEIPTS


def _months(start: date, end: date) -> list[tuple[int, int]]:
    months = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def read_receipts(vault: Path, start: date, end: date) -> list[dict]:
    """Receipts between the dates (inclusive), oldest first."""
    items: list[dict] = []
    for year, month in _months(start, end):
        folder = vault / RECEIPTS / f"{year:04d}" / f"{month:02d}"
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith(".tmp-"):  # atomic write in progress
                continue
            day = path.name[:10]
            if not (start.isoformat() <= day <= end.isoformat()):
                continue
            try:
                post = frontmatter.load(path)
            except Exception:
                continue
            meta = post.metadata
            m = re.search(r"## Request\s*\n(.+)", post.content)
            request = m.group(1).strip()[:140] if m else ""
            at = meta.get("at")
            if isinstance(at, str):
                try:
                    at = datetime.fromisoformat(at)
                except ValueError:
                    at = None
            items.append(
                {
                    "id": meta.get("id"),
                    "at": at,
                    "tier": int(meta.get("tier") or 0),
                    "source": meta.get("source"),
                    "intent": meta.get("intent"),
                    "routine": meta.get("routine"),
                    "status": meta.get("status") or "ok",
                    "model": meta.get("model"),
                    "input_tokens": int(meta.get("input_tokens") or 0),
                    "output_tokens": int(meta.get("output_tokens") or 0),
                    "estimated_cost_usd": float(meta.get("estimated_cost_usd") or 0),
                    "duration_ms": int(meta.get("duration_ms") or 0),
                    "file": path.relative_to(vault).as_posix(),
                    "request": request,
                }
            )
    return sorted(items, key=lambda r: r["at"].isoformat() if r["at"] else "")


def to_json(receipt: dict) -> dict:
    return {**receipt, "at": receipt["at"].isoformat(timespec="seconds") if receipt["at"] else None}


def costs_by_day(receipts: list[dict]) -> list[dict]:
    """Totals per day: calls per tier, tokens and API-equivalent cost (for reference)."""
    days: dict[str, dict] = {}
    for r in receipts:
        if not r["at"]:
            continue
        day = r["at"].date().isoformat()
        d = days.setdefault(
            day,
            {"day": day, "calls": {"1": 0, "2": 0, "3": 0}, "input_tokens": 0, "output_tokens": 0, "estimated_cost_usd": 0.0},
        )
        tier = str(r["tier"]) if r["tier"] in (1, 2, 3) else "1"
        d["calls"][tier] += 1
        d["input_tokens"] += r["input_tokens"]
        d["output_tokens"] += r["output_tokens"]
        d["estimated_cost_usd"] += r["estimated_cost_usd"]
    for d in days.values():
        d["estimated_cost_usd"] = round(d["estimated_cost_usd"], 4)
    return [days[k] for k in sorted(days)]
