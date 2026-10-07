"""Routine scheduler: reads life/routines/*.md, registers the active crons and reloads when
the folder changes (from the HUD or by hand). Uses the configured time zone."""

import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import frontmatter
from apscheduler.schedulers.background import BackgroundScheduler
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from app import clock, cron, ephemeral, push
from app.events import system_events
from app.gandalf import tier3
from app.receipts import Receipt, write_receipt
from app.routines.actions import ACTIONS, ActionFailed
from app.memory.reader import ROUTINES, Routine, read_routines

log = logging.getLogger("gandalf.routines")


class _Watcher(FileSystemEventHandler):
    """Reloads with a 1 s delay to bundle several changes in a row (an editor saving)."""

    def __init__(self, reload):
        self._reload = reload
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def on_any_event(self, event):
        if event.is_directory or not str(event.src_path).endswith(".md"):
            return
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(1.0, self._reload)
            self._timer.daemon = True
            self._timer.start()


class Scheduler:
    def __init__(self, memory: Path, tz: ZoneInfo):
        self.memory = memory
        self.tz = tz
        self._scheduler = BackgroundScheduler(
            timezone=tz,
            # If the computer was asleep, run once on wake-up (up to 10 min late).
            job_defaults={"coalesce": True, "misfire_grace_time": 600, "max_instances": 1},
        )
        self._observer = None
        self._lock = threading.Lock()

    # ---------- lifecycle ----------

    def start(self) -> None:
        self.reload()
        self._scheduler.start()
        folder = self.memory / ROUTINES
        folder.mkdir(parents=True, exist_ok=True)
        self._observer = Observer()
        self._observer.schedule(_Watcher(self.reload), str(folder), recursive=False)
        self._observer.daemon = True
        self._observer.start()
        routines = [j for j in self._scheduler.get_jobs() if not j.id.startswith("_")]  # "_..." = internal jobs
        log.info("scheduler started with %d active routine(s)", len(routines))
        # Routines that missed their time (PC off, Bridge closed) run once now.
        threading.Thread(target=self.recover_late, name="late-routines", daemon=True).start()

    def stop(self) -> None:
        if self._observer:
            self._observer.stop()
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def reload(self) -> None:
        with self._lock:
            self._scheduler.remove_all_jobs()
            for r in read_routines(self.memory):
                if not r.active:
                    continue
                try:
                    trigger = cron.create_trigger(r.cron, self.tz)
                except ValueError:
                    log.warning("routine %s with invalid cron: %r", r.slug, r.cron)
                    continue
                self._scheduler.add_job(self.run, trigger, id=r.slug, args=[r.slug], replace_existing=True)
            # Cleans up expired ephemeral outputs (hourly).
            self._scheduler.add_job(ephemeral.list_items, "interval", hours=1, id="_clean_ephemeral", replace_existing=True)
        system_events.publish({"type": "routines_reloaded"})

    # ---------- queries ----------

    def _created_at(self, routine: Routine) -> datetime:
        """When the routine came to exist: the `created` field (written by the HUD) or the file date."""
        path = self.memory / ROUTINES / f"{routine.slug}.md"
        try:
            created = frontmatter.load(path).get("created")
            if created:
                dt = created if isinstance(created, datetime) else datetime.fromisoformat(str(created))
                return dt if dt.tzinfo else dt.replace(tzinfo=self.tz)
        except (OSError, ValueError, TypeError):
            pass
        try:
            return datetime.fromtimestamp(path.stat().st_ctime, self.tz)
        except OSError:
            return clock.now()

    def late(self, now: datetime) -> list[tuple[Routine, datetime]]:
        """Active routines whose last time has passed with no run since.

        Only the most recent missed time counts (an "every 2h" routine that missed 5 times
        runs once). Times before the routine was created don't count.
        """
        from app.routines.status import TOLERANCE, runs

        pending: list[tuple[Routine, datetime]] = []
        for r in read_routines(self.memory):
            if not r.active:
                continue
            try:
                last = cron.last_fire(r.cron, now, self.tz)
            except ValueError:
                continue
            if last is None or last < self._created_at(r):
                continue
            if not runs(self.memory, last - TOLERANCE, now).get(r.slug):
                pending.append((r, last))
        return pending

    def recover_late(self, wait_s: float = 5.0) -> list[dict]:
        """Runs (once each) the routines that missed their time. Called when the Bridge starts."""
        time.sleep(wait_s)  # let the server finish starting
        results = []
        for r, was in self.late(clock.now()):
            log.info("late routine: %s (was %s)", r.slug, was.isoformat())
            try:
                results.append(self.run(r.slug, late_since=was))
            except Exception:
                log.exception("failed to recover routine %s", r.slug)
        return results

    def next_run(self, routine: Routine) -> datetime | None:
        if not routine.active:
            return None
        try:
            return cron.create_trigger(routine.cron, self.tz).get_next_fire_time(None, clock.now())
        except ValueError:
            return None

    # ---------- execution ----------

    def run(self, slug: str, manual: bool = False, late_since: datetime | None = None) -> dict:
        """Runs the routine now. Tier 1: internal action (receipt right away). Tier 3: opens a session."""
        routine = next((r for r in read_routines(self.memory) if r.slug == slug), None)
        if routine is None:
            raise KeyError(slug)
        now = clock.now()
        request = f"Routine: {routine.name}"
        if late_since:
            request += f" (late: was {late_since:%H:%M} on {late_since:%Y-%m-%d})"
        system_events.publish(
            {"type": "routine", "slug": slug, "status": "running", "manual": manual, "late": late_since is not None}
        )

        if routine.tier == 1:
            start = time.perf_counter()
            action = ACTIONS.get(routine.action or "")
            status = "ok"
            try:
                if not action:
                    raise ActionFailed(f"unknown action: {routine.action!r}")
                response = action[1](self.memory, now)
            except Exception as e:  # record the failure in the receipt instead of bringing the scheduler down
                status = "error"
                response = f"Failed: {e}"
            ephemeral_id = None
            if routine.output == "ephemeral" and status == "ok":
                ephemeral_id = ephemeral.save(routine.name, response, "routine", routine=slug, key=slug).id
                system_events.publish({"type": "ephemeral", "id": ephemeral_id, "title": routine.name})
                push.send_in_background(push.Notification(f"📬 {routine.name} is ready", "Tap to read it in Gandalf.", "/", tag=f"ephemeral-{slug}"))
            elif status == "ok" and routine.notify:
                first_line = response.strip().splitlines()[0][:120] if response.strip() else ""
                push.send_in_background(push.Notification(f"✅ {routine.name}", first_line, "/routines", tag=f"routine-{slug}"))
            elif status == "error":
                push.send_in_background(push.Notification(f"⚠️ {routine.name}: something went wrong", response[:120], "/routines"))
            rid, _ = write_receipt(
                self.memory,
                Receipt(
                    request=request,
                    response="(ephemeral output: shown in the HUD and not stored in the memory)" if ephemeral_id else response,
                    source="routine",
                    tier=1,
                    at=now,
                    duration_ms=round((time.perf_counter() - start) * 1000),
                    intent=f"action:{routine.action}",
                    routine=slug,
                    status=status,
                ),
            )
            system_events.publish({"type": "routine", "slug": slug, "status": status, "receipt_id": rid})
            return {"slug": slug, "tier": 1, "status": status, "receipt_id": rid, "response": response, "ephemeral_id": ephemeral_id}

        task = routine.description or routine.name
        s = tier3.manager(self.memory).create(
            task,
            request=request,
            source="routine",
            skill=routine.skill,
            routine=slug,
            output=routine.output,
            notify=routine.notify,
        )
        return {"slug": slug, "tier": 3, "status": s.status, "session_id": s.id}


_scheduler: Scheduler | None = None
_global_lock = threading.Lock()


def scheduler(memory: Path) -> Scheduler:
    """The memory's scheduler (created without starting; the app lifespan calls `start`)."""
    global _scheduler
    with _global_lock:
        if _scheduler is None or _scheduler.memory != memory:
            _scheduler = Scheduler(memory, clock.tz())
        return _scheduler


def reset() -> None:
    global _scheduler
    with _global_lock:
        if _scheduler:
            _scheduler.stop()
        _scheduler = None
