"""Reminder scheduler (`life/reminders.md`): alerts on time by push and in the open HUD.

- One-off: fires once and is checked `[x]`. If the Bridge was off at that time, it fires on startup
  (marked "late").
- Recurring (cron): fires at every time. On startup, the last missed time within the last
  `RECOVER_RECURRING` hours fires once.
The state of recurring reminders (last alert) lives in `bridge/data/reminders_state.json`.
"""

import json
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from app import clock, cron, push
from app.config import get_settings
from app.events import system_events
from app.vault import reminders as store
from app.vault.reminders import Reminder

log = logging.getLogger("gandalf.reminders")
RECOVER_RECURRING = timedelta(hours=6)
ALERT = "alert-"


def _state_path() -> Path:
    p = get_settings().data_path
    p.mkdir(parents=True, exist_ok=True)
    return p / "reminders_state.json"


def _state() -> dict[str, str]:
    try:
        return json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _mark_state(reminder_id: str, when: datetime) -> None:
    s = _state()
    s[reminder_id] = when.isoformat(timespec="seconds")
    _state_path().write_text(json.dumps(s, indent=1), encoding="utf-8")


def reminder_json(x: Reminder, next_fire: datetime | None = None) -> dict:
    if next_fire is None and not x.done:
        next_fire = x.when
    return {
        "id": x.id,
        "text": x.text,
        "done": x.done,
        "when": x.when.isoformat(timespec="minutes") if x.when else None,
        "recurrence": x.recurrence,
        "recurrence_text": cron.describe(x.recurrence) if x.recurrence else None,
        "done_at": x.done_at.isoformat(timespec="minutes") if x.done_at else None,
        "next": next_fire.isoformat(timespec="minutes") if next_fire else None,
    }


class _Watcher(FileSystemEventHandler):
    def __init__(self, reload):
        self._reload = reload
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def on_any_event(self, event):
        if event.is_directory or not str(event.src_path).replace("\\", "/").endswith(store.REMINDERS.as_posix()):
            return
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(0.7, self._reload)
            self._timer.daemon = True
            self._timer.start()


class ReminderScheduler:
    def __init__(self, vault: Path, tz: ZoneInfo):
        self.vault = vault
        self.tz = tz
        self._scheduler = BackgroundScheduler(
            timezone=tz, job_defaults={"coalesce": True, "misfire_grace_time": 3600, "max_instances": 1}
        )
        self._observer = None
        self._lock = threading.Lock()

    def start(self) -> None:
        self._scheduler.start()
        self.reload(recover=True)
        folder = (self.vault / store.REMINDERS).parent
        folder.mkdir(parents=True, exist_ok=True)
        self._observer = Observer()
        self._observer.schedule(_Watcher(self.reload), str(folder), recursive=False)
        self._observer.daemon = True
        self._observer.start()

    def stop(self) -> None:
        if self._observer:
            self._observer.stop()
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def next_fire(self, x: Reminder, now: datetime | None = None) -> datetime | None:
        if x.done:
            return None
        if x.when:
            return x.when
        try:
            return cron.create_trigger(x.recurrence, self.tz).get_next_fire_time(None, now or clock.now())
        except (ValueError, TypeError):
            return None

    def reload(self, recover: bool = False) -> None:
        """Reschedules everything from the file. Overdue one-offs fire right away (the Bridge was off)."""
        now = clock.now()
        late: list[tuple[str, datetime]] = []
        with self._lock:
            for job in self._scheduler.get_jobs():
                if not job.id.startswith(ALERT):  # standalone alerts (pomodoro) don't come from the file
                    job.remove()
            state = _state()
            for x in store.read(self.vault, self.tz):
                if x.done:
                    continue
                if x.when:
                    if x.when <= now:
                        late.append((x.id, x.when))
                    else:
                        self._scheduler.add_job(self.fire, DateTrigger(x.when, self.tz), id=x.id, args=[x.id], replace_existing=True)
                    continue
                try:
                    trigger = cron.create_trigger(x.recurrence, self.tz)
                except (ValueError, TypeError):
                    log.warning("reminder %s with invalid recurrence: %r", x.id, x.recurrence)
                    continue
                self._scheduler.add_job(self.fire, trigger, id=x.id, args=[x.id], replace_existing=True)
                if recover:
                    last = cron.last_fire(x.recurrence, now, self.tz, window_days=1)
                    alerted = state.get(x.id)
                    if last and now - last <= RECOVER_RECURRING and (not alerted or datetime.fromisoformat(alerted) < last):
                        late.append((x.id, last))
        for rid, was in late:
            self._scheduler.add_job(self.fire, "date", run_date=now + timedelta(seconds=2), args=[rid, was],
                                    id=f"late-{rid}", replace_existing=True)
        system_events.publish({"type": "reminders"})

    # ---------- standalone alerts (outside the file; e.g. the end of a pomodoro) ----------

    def schedule_alert(self, name: str, when: datetime, title: str, body: str = "", url: str = "/") -> bool:
        """One push at `when`, in memory only (if the Bridge restarts, the alert is gone). Replaces the one with the same name."""
        if not self._scheduler.running:
            return False
        n = push.Notification(title=title, body=body, url=url, tag=ALERT + name)
        self._scheduler.add_job(push.send, DateTrigger(when, self.tz), args=[n], id=ALERT + name, replace_existing=True)
        return True

    def cancel_alert(self, name: str) -> bool:
        try:
            self._scheduler.remove_job(ALERT + name)
            return True
        except Exception:
            return False

    def fire(self, reminder_id: str, late_since: datetime | None = None) -> dict | None:
        """Alerts (push + open HUD) and closes a one-off reminder."""
        now = clock.now()
        x = next((y for y in store.read(self.vault, self.tz) if y.id == reminder_id), None)
        if x is None or x.done:
            return None
        body = "Tap to open Gandalf."
        is_late = bool(late_since and now - late_since > timedelta(minutes=2))
        if is_late:
            body = f"Late: was due at {late_since:%H:%M}" + (f" on {late_since:%m/%d}" if late_since.date() != now.date() else "") + "."
        sent = push.send(
            push.Notification(title=f"⏰ {x.text}", body=body, url=f"/?reminder={x.id}", tag=f"reminder-{x.id}",
                              reminder_id=None if x.recurring else x.id)
        )
        if x.recurring:
            _mark_state(x.id, now)
        else:
            try:
                store.update(self.vault, self.tz, x.id, done=True, now=now)
            except store.ReminderNotFound:
                pass
        event = {"type": "reminder", "id": x.id, "text": x.text, "push": sent, "late": is_late}
        system_events.publish(event)
        log.info("reminder %s fired (%d device[s])", x.id, sent)
        return event


_scheduler: ReminderScheduler | None = None
_global_lock = threading.Lock()


def scheduler(vault: Path) -> ReminderScheduler:
    global _scheduler
    with _global_lock:
        if _scheduler is None or _scheduler.vault != vault:
            _scheduler = ReminderScheduler(vault, clock.tz())
        return _scheduler


def reload_if_running(vault: Path) -> None:
    """After a write by the Bridge (the watcher also catches it, but this is immediate)."""
    with _global_lock:
        s = _scheduler if _scheduler and _scheduler.vault == vault and _scheduler._scheduler.running else None
    if s:
        s.reload()


def reset() -> None:
    global _scheduler
    with _global_lock:
        if _scheduler:
            _scheduler.stop()
        _scheduler = None
