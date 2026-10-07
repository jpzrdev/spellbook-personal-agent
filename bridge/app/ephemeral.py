"""Ephemeral outputs: passing results (e.g. an email summary) that do NOT go to the memory.

They live in `bridge/data/ephemeral/<id>.json` (outside the memory and git) and expire after
`GANDALF_EPHEMERAL_HOURS`. The user can deliberately save an item to the memory (raw/ or a task).
"""

import json
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path

from app import clock
from app.config import get_settings

_lock = threading.Lock()


@dataclass
class Ephemeral:
    id: str
    title: str
    text: str
    created: str
    expires: str
    source: str  # routine | skill | hud
    routine: str | None = None
    session_id: str | None = None
    key: str | None = None  # source skill/routine: a new summary replaces the previous one with the same key
    # Web research result: {topic, kind, request, slug} for the "Save to memory" button to organize.
    research: dict | None = None


def _folder() -> Path:
    folder = get_settings().data_path / "ephemeral"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def save(title: str, text: str, source: str, routine: str | None = None, session_id: str | None = None,
         key: str | None = None, research: dict | None = None, hours: float | None = None) -> Ephemeral:
    now = clock.now()
    e = Ephemeral(
        id=uuid.uuid4().hex[:12],
        title=title,
        text=text.strip(),
        created=now.isoformat(timespec="seconds"),
        expires=(now + timedelta(hours=hours or get_settings().ephemeral_hours)).isoformat(timespec="seconds"),
        source=source,
        routine=routine,
        session_id=session_id,
        key=key,
        research=research,
    )
    with _lock:
        if key:  # "Today's summaries" shows only the latest version of each summary
            for path in _folder().glob("*.json"):
                try:
                    if json.loads(path.read_text(encoding="utf-8")).get("key") == key:
                        path.unlink()
                except (OSError, ValueError):
                    continue
        (_folder() / f"{e.id}.json").write_text(json.dumps(asdict(e), ensure_ascii=False, indent=2), encoding="utf-8")
    return e


def list_items() -> list[Ephemeral]:
    """Valid items, newest first. Deletes expired ones along the way."""
    now = clock.now()
    items: list[Ephemeral] = []
    with _lock:
        for path in _folder().glob("*.json"):
            try:
                e = Ephemeral(**json.loads(path.read_text(encoding="utf-8")))
                expired = datetime.fromisoformat(e.expires) <= now
            except (ValueError, TypeError, json.JSONDecodeError):
                expired, e = True, None
            if expired:
                path.unlink(missing_ok=True)
            elif e:
                items.append(e)
    return sorted(items, key=lambda x: x.created, reverse=True)


def get(ephemeral_id: str) -> Ephemeral | None:
    return next((e for e in list_items() if e.id == ephemeral_id), None)


def remove(ephemeral_id: str) -> bool:
    if not ephemeral_id.isalnum():
        return False
    with _lock:
        path = _folder() / f"{ephemeral_id}.json"
        existed = path.exists()
        path.unlink(missing_ok=True)
    return existed
