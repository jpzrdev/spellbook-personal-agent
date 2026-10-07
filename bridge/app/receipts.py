"""Receipts: one markdown file per request in receipts/YYYY/MM/ (never edited afterwards)."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import yaml
from ulid import ULID

from app.memory.writer import slugify, write_atomic

RECEIPTS = Path("receipts")


@dataclass
class Receipt:
    request: str
    response: str
    source: str  # hud | voice | routine
    tier: int
    at: datetime
    duration_ms: int
    intent: str | None = None
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0.0
    claude_code_session: str | None = None
    routine: str | None = None  # slug of the routine that fired it (source: routine)
    status: str = "ok"  # ok | error | cancelled | timed_out


def write_receipt(memory: Path, r: Receipt) -> tuple[str, Path]:
    """Writes the receipt and returns (id, path)."""
    rid = str(ULID.from_datetime(r.at))
    folder = memory / RECEIPTS / f"{r.at:%Y}" / f"{r.at:%m}"
    base = f"{r.at:%Y-%m-%d-%H%M%S}-{slugify(r.request, 40)}"
    path = folder / f"{base}.md"
    if path.exists():
        path = folder / f"{base}-{rid[-6:].lower()}.md"

    meta = {
        "type": "receipt",
        "id": rid,
        "at": r.at.isoformat(timespec="seconds"),
        "source": r.source,
        "tier": r.tier,
        "intent": r.intent,
        "model": r.model,
        "duration_ms": r.duration_ms,
        "input_tokens": r.input_tokens,
        "output_tokens": r.output_tokens,
        "estimated_cost_usd": r.estimated_cost_usd,
        "claude_code_session": r.claude_code_session,
        "routine": r.routine,
        "status": r.status,
    }
    header = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)
    content = f"---\n{header}---\n## Request\n{r.request.strip()}\n\n## Response\n{r.response.strip()}\n"
    write_atomic(path, content)
    return rid, path
