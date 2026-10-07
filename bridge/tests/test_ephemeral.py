import json
import time
from pathlib import Path

import frontmatter

from app import ephemeral
from app.gandalf import tier3
from app.skills.catalog import _tools, get_skill


def wait_for_session(client, sid: str, timeout: float = 15) -> dict:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        s = client.get(f"/sessions/{sid}").json()
        if s["status"] not in ("queued", "running"):
            return s
        time.sleep(0.1)
    raise AssertionError("session did not finish")


def _ephemeral_routine(client):
    r = client.post("/routines", json={
        "name": "Email summary", "cron": "0 8 * * 1-5", "tier": 3,
        "skill": "email-summary", "output": "ephemeral", "description": "Summarize the important emails.",
    })
    assert r.status_code == 201 and r.json()["output"] == "ephemeral"


def test_ephemeral_routine_does_not_store_content_in_the_memory(client, memory):
    _ephemeral_routine(client)
    assert "output: ephemeral" in (memory / "life/routines/email-summary.md").read_text(encoding="utf-8")

    sid = client.post("/routines/email-summary/run").json()["session_id"]
    s = wait_for_session(client, sid)
    assert s["status"] == "ok" and s["output"] == "ephemeral" and s["ephemeral_id"]

    # The content goes to ephemeral storage, which shows up in the HUD...
    [item] = client.get("/ephemeral").json()
    assert item["text"] == "Done: I wrote output/test-report.md." and item["routine"] == "email-summary"
    # ...and the receipt in the memory keeps only metadata.
    [rec] = [frontmatter.load(p) for p in (memory / "receipts").rglob("*.md")]
    assert rec["routine"] == "email-summary" and rec["status"] == "ok"
    assert "Done: I wrote" not in rec.content and "ephemeral output" in rec.content


def test_ephemeral_session_runs_read_only_plus_the_skill_tools(memory):
    m = tier3.Manager(memory)
    s = tier3.Session(id="x", task="t", request="p", source="routine", created=None, skill="email-summary", output="ephemeral")
    args = m._args(s)
    assert args[args.index("--allowedTools") + 1] == "Read(**),Glob(**),Grep(**),mcp__gmail,Read(**)"
    assert m._prompt(s).startswith("/gandalf:email-summary t") and "ephemeral" in m._prompt(s)

    assert "--add-dir" not in args  # only sessions that write to the memory can edit skills

    normal = tier3.Session(id="y", task="t", request="p", source="hud", created=None)
    assert "Write" in m._args(normal)[m._args(normal).index("--allowedTools") + 1]


def test_tier3_loads_the_skills_as_a_plugin_and_can_edit_them(memory, tmp_path):
    skills = tmp_path / "skills"
    (skills / ".gitignore").write_text("/*/\n", encoding="utf-8")
    m = tier3.Manager(memory)
    args = m._args(tier3.Session(id="x", task="t", request="p", source="hud", created=None))
    plugin = Path(args[args.index("--plugin-dir") + 1])
    manifest = json.loads((plugin / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
    assert manifest["name"] == "gandalf"
    assert (plugin / "skills" / "email-summary" / "SKILL.md").read_bytes() == (skills / "email-summary" / "SKILL.md").read_bytes()
    assert not (plugin / "skills" / ".gitignore").exists()
    # Gandalf edits the source (skills/), never the copy Claude Code loaded.
    tools = args[args.index("--allowedTools") + 1]
    assert f"Edit({tier3.rule_path(skills)}/**)" in tools and tier3.rule_path(skills).startswith("//")
    assert args[args.index("--add-dir") + 1] == str(skills.resolve())
    assert str(skills.resolve()) in args[args.index("--append-system-prompt") + 1]

    # Same contents → same copy; a changed skill → a new copy (the old one stays for running sessions).
    assert m._args(tier3.Session(id="y", task="t", request="p", source="hud", created=None))[args.index("--plugin-dir") + 1] == str(plugin)
    (skills / "new-one").mkdir()
    (skills / "new-one" / "SKILL.md").write_text("---\nname: new-one\ndescription: d\n---\nDo it.\n", encoding="utf-8")
    args2 = m._args(tier3.Session(id="z", task="t", request="p", source="hud", created=None))
    new = Path(args2[args2.index("--plugin-dir") + 1])
    assert new != plugin and plugin.is_dir() and (new / "skills" / "new-one" / "SKILL.md").is_file()


def test_tier3_gets_the_language_instruction(memory, pt_br):
    args = tier3.Manager(memory)._args(tier3.Session(id="x", task="t", request="p", source="hud", created=None))
    assert "Brazilian Portuguese" in args[args.index("--append-system-prompt") + 1]


def test_the_memory_mcp_is_loaded_explicitly(memory):
    (memory / ".mcp.json").write_text('{"mcpServers": {}}', encoding="utf-8")
    args = tier3.Manager(memory)._args(tier3.Session(id="x", task="t", request="p", source="hud", created=None))
    assert args[args.index("--mcp-config") + 1] == str(memory / ".mcp.json")


def test_allowed_tools_formats(memory):
    assert _tools("Read, Bash(git *) mcp__gmail") == ["Read", "Bash(git *)", "mcp__gmail"]
    assert _tools(["mcp__google_calendar"]) == ["mcp__google_calendar"]
    assert get_skill("email-summary").tools == ["mcp__gmail", "Read"]


def test_save_and_discard_ephemeral(client, memory):
    e = ephemeral.save("Email summary", "- The tuition bill is due Friday\n- Meeting rescheduled", "routine")
    r = client.post(f"/ephemeral/{e.id}/save", json={"target": "task", "text": "Pay the tuition bill"})
    assert r.status_code == 201 and r.json()["task"]["text"] == "Pay the tuition bill"
    r = client.post(f"/ephemeral/{e.id}/save", json={"target": "raw"}).json()
    assert (memory / r["file"]).read_text(encoding="utf-8").strip().endswith("- Meeting rescheduled")
    assert client.post(f"/ephemeral/{e.id}/save", json={"target": "task"}).status_code == 422
    assert client.delete(f"/ephemeral/{e.id}").status_code == 204
    assert client.get("/ephemeral").json() == []
    assert client.delete(f"/ephemeral/{e.id}").status_code == 404


def test_ephemeral_expires(monkeypatch, tmp_path):
    from app import clock
    from tests.conftest import NOW

    monkeypatch.setattr(clock, "now", lambda: NOW)
    e = ephemeral.save("x", "y", "hud")
    assert [i.id for i in ephemeral.list_items()] == [e.id]
    monkeypatch.setattr(clock, "now", lambda: NOW.replace(day=6))  # +72 h > 48 h
    assert ephemeral.list_items() == []
    assert not any(Path(ephemeral._folder()).glob("*.json"))


def test_studies_list(client):
    [calc] = client.get("/studies").json()
    assert calc["subject"] == "calculus" and calc["title"] == "Calculus II"
    assert calc["topic_count"] == 2 and calc["annotation_count"] == 0 and calc["source_count"] == 0


def test_ephemeral_skill_run_from_the_skills_tab_does_not_go_to_the_memory(client, memory):
    """Real bug: running /email-summary from the Skills tab wrote the emails into the receipt and didn't show in Summaries."""
    from test_tier2_tier3 import wait_for_end

    for _ in range(2):  # the second run replaces the first on the card
        s = client.post("/skills/email-summary/run", json={"instruction": ""}).json()
        assert s["output"] == "ephemeral"
        end = wait_for_end(client, s["id"])
        for _ in range(50):  # the status turns "ok" an instant before the summary is stored
            if end["receipt_id"]:
                break
            time.sleep(0.05)
            end = client.get(f"/sessions/{s['id']}").json()
        assert end["status"] == "ok" and end["ephemeral_id"]
    [item] = client.get("/ephemeral").json()
    assert item["title"] == "Email summary" and item["id"] == end["ephemeral_id"]
    for receipt in (memory / "receipts").rglob("*.md"):
        assert item["text"] not in receipt.read_text(encoding="utf-8")
