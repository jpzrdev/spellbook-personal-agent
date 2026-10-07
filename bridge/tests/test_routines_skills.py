import subprocess
import time
from pathlib import Path

import frontmatter
import pytest

from app.routines import scheduler
from tests.conftest import TZ


def wait_for_session(client, sid: str, timeout: float = 15) -> dict:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        s = client.get(f"/sessions/{sid}").json()
        if s["status"] not in ("queued", "running"):
            return s
        time.sleep(0.1)
    raise AssertionError("session did not finish")


def receipts(memory: Path) -> list[frontmatter.Post]:
    return [frontmatter.load(p) for p in sorted((memory / "receipts").rglob("*.md")) if not p.name.startswith(".tmp-")]


# ---------- routines: CRUD ----------

def test_list_routines(client):
    routines = {r["slug"]: r for r in client.get("/routines").json()}
    assert set(routines) == {"compile-raw", "morning-summary", "paused"}
    assert routines["compile-raw"]["schedule"] == "every day at 23:00"
    assert routines["compile-raw"]["next"] == "2026-10-03T23:00:00-03:00"
    assert routines["paused"]["next"] is None


def test_create_routine_writes_md(client, memory):
    r = client.post("/routines", json={
        "name": "Calculus review", "cron": "30 19 * * 1,3,5", "tier": 3,
        "skill": "review-studies", "description": "Review calculus II.",
    })
    assert r.status_code == 201
    assert r.json()["slug"] == "calculus-review" and r.json()["schedule"] == "Mon, Wed, Fri at 19:30"
    post = frontmatter.load(memory / "life/routines/calculus-review.md")
    assert 'cron: "30 19 * * 1,3,5"' in (memory / "life/routines/calculus-review.md").read_text(encoding="utf-8")
    assert post["cron"] == "30 19 * * 1,3,5" and post["active"] is True and post["skill"] == "review-studies"
    assert post.content == "Review calculus II."


@pytest.mark.parametrize(
    "body,code",
    [
        ({"name": "x", "cron": "this is not cron", "tier": 3}, 422),
        ({"name": "x", "cron": "0 8 * * *", "tier": 1, "action": "missing"}, 422),
        ({"name": "Compile raw", "cron": "0 8 * * *", "tier": 3}, 409),
    ],
)
def test_create_invalid_routine(client, body, code):
    assert client.post("/routines", json=body).status_code == code


def test_edit_routine_keeps_body_and_fields(client, memory):
    r = client.patch("/routines/compile-raw", json={"active": False, "cron": "0 22 * * *"}).json()
    assert r["active"] is False and r["schedule"] == "every day at 22:00"
    post = frontmatter.load(memory / "life/routines/compile-raw.md")
    assert post["skill"] == "compile-raw" and post.content == "Organizes raw/ every night."


def test_remove_routine(client, memory):
    assert client.delete("/routines/paused").status_code == 204
    assert not (memory / "life/routines/paused.md").exists()
    assert client.delete("/routines/paused").status_code == 404
    assert client.delete("/routines/..%2Fsecret").status_code == 404


# ---------- routines: running ----------

def test_run_now_tier3_writes_a_routine_receipt(client, memory):
    r = client.post("/routines/compile-raw/run").json()
    assert r["tier"] == 3
    s = wait_for_session(client, r["session_id"])
    assert s["status"] == "ok" and s["routine"] == "compile-raw" and s["skill"] == "compile-raw"
    [rec] = receipts(memory)
    assert rec["source"] == "routine" and rec["routine"] == "compile-raw" and rec["status"] == "ok"
    hist = next(x for x in client.get("/routines").json() if x["slug"] == "compile-raw")["history"]
    assert hist[0]["status"] == "ok"


def _commit_routine(client, cron: str = "0 9 * * *"):
    assert client.post("/routines", json={"name": "Commit", "cron": cron, "tier": 1, "action": "git-commit"}).status_code == 201


def test_tier1_routine_without_git_records_an_error_and_shows_in_today(client, memory):
    _commit_routine(client)
    r = client.post("/routines/commit/run").json()
    assert r["status"] == "error" and "git" in r["response"]
    item = next(i for i in client.get("/today").json()["routines"] if i["slug"] == "commit")
    assert item["time"] == "09:00" and item["status"] == "error"  # ran at 09:15, counts for 09:00


def test_git_commit_routine_ok(client, memory):
    for args in (["init", "-q"], ["config", "user.email", "t@t"], ["config", "user.name", "T"]):
        subprocess.run(["git", *args], cwd=memory, check=True)
    _commit_routine(client)
    r = client.post("/routines/commit/run").json()
    assert r["status"] == "ok" and "Committed" in r["response"]
    log = subprocess.run(["git", "log", "--oneline"], cwd=memory, capture_output=True, text=True, encoding="utf-8").stdout
    assert "Daily commit 2026-10-03 09:15" in log
    # Second time: nothing new besides the receipt just written (which goes into the next commit).
    assert client.post("/routines/commit/run").json()["status"] == "ok"


def test_status_pending_and_missed(client):
    _commit_routine(client, "0 8,20 * * *")
    items = [i for i in client.get("/today").json()["routines"] if i["slug"] == "commit"]
    assert [(i["time"], i["status"]) for i in items] == [("08:00", "missed"), ("20:00", "pending")]


# ---------- scheduler ----------

def test_scheduler_registers_active_ones_and_reloads_when_the_folder_changes(memory):
    s = scheduler.Scheduler(memory, TZ)
    s.start()
    try:
        routines = {j.id for j in s._scheduler.get_jobs() if not j.id.startswith("_")}
        assert routines == {"compile-raw", "morning-summary"}
        assert s._scheduler.get_job("_clean_ephemeral") is not None
        (memory / "life/routines/new.md").write_text(
            '---\ntype: routine\nname: New\ncron: "0 12 * * *"\nactive: true\ntier: 3\n---\nTest.\n', encoding="utf-8"
        )
        end = time.monotonic() + 8
        while time.monotonic() < end and "new" not in {j.id for j in s._scheduler.get_jobs()}:
            time.sleep(0.2)
        assert "new" in {j.id for j in s._scheduler.get_jobs()}
        job = s._scheduler.get_job("morning-summary")
        # Mon–Fri at 06:50 in standard cron (the next one after Saturday 10/03 is Monday 10/05)
        assert job.trigger.get_next_fire_time(None, job.next_run_time.replace(year=2026, month=10, day=3)).isoformat().startswith("2026-10-05T06:50")
    finally:
        s.stop()


# ---------- skills ----------

def test_skills_list_run_and_last_run(client, memory):
    skill = next(x for x in client.get("/skills").json() if x["name"] == "daily-summary")
    assert skill["last_run"] is None
    s = client.post("/skills/daily-summary/run", json={"instruction": "focus on studies"}).json()
    assert s["skill"] == "daily-summary"
    assert wait_for_session(client, s["id"])["status"] == "ok"
    [rec] = receipts(memory)
    assert rec["intent"] == "skill:daily-summary" and rec["tier"] == 3
    skill = next(x for x in client.get("/skills").json() if x["name"] == "daily-summary")
    assert skill["last_run"]["status"] == "ok"
    assert client.post("/skills/does-not-exist/run", json={}).status_code == 404
