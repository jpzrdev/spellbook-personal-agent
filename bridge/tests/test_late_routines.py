import time
from datetime import datetime

import frontmatter

from app import cron
from app.receipts import Receipt, write_receipt
from app.routines import scheduler
from tests.conftest import NOW, TZ

OLD = datetime(2026, 9, 1, tzinfo=TZ)


def test_last_fire():
    # NOW = Saturday 10/03 09:15
    assert cron.last_fire("50 6 * * 1-5", NOW, TZ) == datetime(2026, 10, 2, 6, 50, tzinfo=TZ)
    assert cron.last_fire("0 23 * * *", NOW, TZ) == datetime(2026, 10, 2, 23, 0, tzinfo=TZ)
    assert cron.last_fire("0 7-22/2 * * *", NOW, TZ) == datetime(2026, 10, 3, 9, 0, tzinfo=TZ)
    assert cron.last_fire("0 20 * * 0", NOW, TZ) == datetime(2026, 9, 27, 20, 0, tzinfo=TZ)


def _scheduler(memory, monkeypatch, created=OLD):
    s = scheduler.Scheduler(memory, TZ)
    monkeypatch.setattr(s, "_created_at", lambda r: created)
    return s


def test_detects_routines_that_missed_their_time(memory, now, monkeypatch):
    s = _scheduler(memory, monkeypatch)
    pending = {r.slug: was for r, was in s.late(NOW)}
    # Active in the fixture: compile-raw (every day 23:00) and morning-summary (Mon–Fri 06:50). "paused" stays out.
    assert pending == {
        "compile-raw": datetime(2026, 10, 2, 23, 0, tzinfo=TZ),
        "morning-summary": datetime(2026, 10, 2, 6, 50, tzinfo=TZ),
    }


def test_a_run_after_the_time_counts_as_done(memory, now, monkeypatch):
    write_receipt(memory, Receipt("Routine: Compile raw", "ok", "routine", 3, datetime(2026, 10, 2, 23, 1, tzinfo=TZ), 10, routine="compile-raw"))
    pending = [r.slug for r, _ in _scheduler(memory, monkeypatch).late(NOW)]
    assert pending == ["morning-summary"]


def test_routine_created_after_the_time_does_not_run(memory, now, monkeypatch):
    assert _scheduler(memory, monkeypatch, created=NOW).late(NOW) == []


def test_recovers_once_and_marks_the_receipt(client, memory, monkeypatch):
    s = _scheduler(memory, monkeypatch)
    results = s.recover_late(wait_s=0)
    assert sorted(r["slug"] for r in results) == ["compile-raw", "morning-summary"]
    for r in results:  # both are Tier 3: wait for the sessions (fake Claude Code) to finish
        end = time.monotonic() + 15
        while client.get(f"/sessions/{r['session_id']}").json()["status"] in ("queued", "running") and time.monotonic() < end:
            time.sleep(0.1)
    requests = sorted(frontmatter.load(p).content.split("\n")[1] for p in (memory / "receipts").rglob("*.md"))
    assert requests == [
        "Routine: Compile raw (late: was 23:00 on 2026-10-02)",
        "Routine: Morning summary (late: was 06:50 on 2026-10-02)",
    ]
    # It ran: on the next startup nothing is late anymore.
    assert s.late(NOW) == []


def test_routine_created_in_the_hud_records_the_date(client, memory):
    client.post("/routines", json={"name": "New", "cron": "0 8 * * *", "tier": 3})
    assert frontmatter.load(memory / "life/routines/new.md")["created"] == "2026-10-03T09:15:12-03:00"
