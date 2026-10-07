"""Proposed Google Calendar events, waiting for the user's confirmation in the HUD.

They live in `bridge/data/proposals/<id>.json` (outside the memory) and expire in 7 days. Nothing is
created on the calendar without `POST /proposals/{id}/confirm`.
"""

import json
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

from app import clock
from app.config import get_settings

_lock = threading.Lock()
VALIDITY = timedelta(days=7)
REPEAT = ("yearly", "monthly", "weekly", "daily")
RRULE = {"yearly": "RRULE:FREQ=YEARLY", "monthly": "RRULE:FREQ=MONTHLY", "weekly": "RRULE:FREQ=WEEKLY", "daily": "RRULE:FREQ=DAILY"}


class InvalidProposal(ValueError):
    pass


@dataclass
class Event:
    """Simple format (easy for Tier 2 and for the HUD form); the Bridge builds the rest."""

    title: str
    date: str  # YYYY-MM-DD
    all_day: bool = False
    start_time: str | None = None  # HH:MM
    end_time: str | None = None
    repeat: str | None = None  # yearly | monthly | weekly | daily
    reminders_min: list[int] = field(default_factory=list)
    location: str | None = None
    description: str | None = None


@dataclass
class Proposal:
    id: str
    event: Event
    request: str
    source: str
    created: str
    expires: str
    status: str = "pending"  # pending | confirmed
    session_id: str | None = None


def _hhmm(value: str | None, field_name: str) -> str | None:
    if not value:
        return None
    try:
        h, m = str(value).strip().split(":")[:2]
        return f"{int(h):02d}:{int(m):02d}" if 0 <= int(h) < 24 and 0 <= int(m) < 60 else _error(field_name)
    except ValueError:
        return _error(field_name)


def _error(field_name: str):
    raise InvalidProposal(f"invalid {field_name}")


def normalize(data: dict) -> Event:
    """Validates and completes an event coming from Tier 2 or from the form."""
    title = str(data.get("title") or "").strip()
    if not title:
        raise InvalidProposal("the event needs a title")
    try:
        day = date.fromisoformat(str(data.get("date") or "")[:10])
    except ValueError as e:
        raise InvalidProposal("invalid event date") from e
    start = _hhmm(data.get("start_time"), "start time")
    all_day = bool(data.get("all_day")) or not start
    end = None
    if not all_day:
        end = _hhmm(data.get("end_time"), "end time")
        if not end or end <= start:  # default: 1 hour
            h, m = map(int, start.split(":"))
            end = f"{min(h + 1, 23):02d}:{m if h < 23 else 59:02d}"
    repeat = data.get("repeat") or None
    if repeat not in (None, *REPEAT):
        raise InvalidProposal(f"invalid repeat: {repeat}")
    reminders = data.get("reminders_min")
    if reminders is None:
        reminders = [900] if all_day else [30]  # all day: the day before at 9:00
    try:
        reminders = sorted({int(a) for a in reminders if 0 <= int(a) <= 40320})[:5]
    except (TypeError, ValueError) as e:
        raise InvalidProposal("invalid reminders") from e
    text = lambda k, n: (str(data.get(k) or "").strip()[:n] or None)  # noqa: E731
    return Event(
        title=title[:200], date=day.isoformat(), all_day=all_day,
        start_time=None if all_day else start, end_time=end, repeat=repeat,
        reminders_min=reminders, location=text("location", 200), description=text("description", 1000),
    )


def create_event_args(e: Event, timezone: str) -> dict:
    """The exact parameters for the Google Calendar connector's `create_event` tool."""
    tz = clock.tz()
    day = date.fromisoformat(e.date)
    if e.all_day:
        start = datetime.combine(day, datetime.min.time(), tz)
        end = start + timedelta(days=1)
    else:
        start = datetime.combine(day, datetime.strptime(e.start_time, "%H:%M").time(), tz)
        end = datetime.combine(day, datetime.strptime(e.end_time, "%H:%M").time(), tz)
    args: dict = {
        "summary": e.title,
        "startTime": start.isoformat(timespec="seconds"),
        "endTime": end.isoformat(timespec="seconds"),
        "timeZone": timezone,
        "allDay": e.all_day,
    }
    if e.all_day:
        args["availability"] = "AVAILABILITY_FREE"
    if e.repeat:
        args["recurrenceData"] = [RRULE[e.repeat]]
    if e.reminders_min:
        args["overrideReminders"] = [{"method": "popup", "minutes": m} for m in e.reminders_min]
    else:
        args["useDefaultReminders"] = False
    if e.location:
        args["location"] = e.location
    if e.description:
        args["description"] = e.description
    return args


# ---------- storage ----------

def _folder() -> Path:
    folder = get_settings().data_path / "proposals"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _write(p: Proposal) -> None:
    (_folder() / f"{p.id}.json").write_text(json.dumps(asdict(p), ensure_ascii=False, indent=1), encoding="utf-8")


def create(event: Event, request: str, source: str) -> Proposal:
    now = clock.now()
    p = Proposal(
        id=uuid.uuid4().hex[:12], event=event, request=request[:500], source=source,
        created=now.isoformat(timespec="seconds"), expires=(now + VALIDITY).isoformat(timespec="seconds"),
    )
    with _lock:
        _write(p)
    return p


def get(proposal_id: str) -> Proposal | None:
    if not proposal_id.isalnum():
        return None
    path = _folder() / f"{proposal_id}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    p = Proposal(**{**data, "event": Event(**data["event"])})
    if datetime.fromisoformat(p.expires) < clock.now():
        path.unlink(missing_ok=True)
        return None
    return p


def confirm(p: Proposal, event: Event, session_id: str) -> Proposal:
    p.event, p.status, p.session_id = event, "confirmed", session_id
    with _lock:
        _write(p)
    return p


def remove(proposal_id: str) -> bool:
    if not proposal_id.isalnum():
        return False
    path = _folder() / f"{proposal_id}.json"
    existed = path.exists()
    path.unlink(missing_ok=True)
    return existed
