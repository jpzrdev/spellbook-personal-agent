"""Web research (web only, no vault) → ephemeral result → saved, organized, in the Library."""

import time

from app.gandalf import tier3
from test_tier2_tier3 import wait_for_end


def _wait_for_receipt(client, session_id):
    s = wait_for_end(client, session_id)
    for _ in range(60):  # the status turns "ok" an instant before the result is stored
        if s["receipt_id"]:
            return s
        time.sleep(0.05)
        s = client.get(f"/sessions/{session_id}").json()
    return s


def test_tools_of_each_mode_are_pinned_to_the_vault(vault):
    """Security regression (tested with the real CLI): without `(**)` Claude Code read/wrote outside the vault,
    and with acceptEdits the "read-only" sessions could write."""
    m = tier3.manager(vault)

    def tools(output, skill=None):
        s = tier3.Session(id="x", task="t", request="p", source="hud", created=None, output=output, skill=skill)
        args = m._args(s)
        assert args[args.index("--permission-mode") + 1] == "default"
        return args[args.index("--allowedTools") + 1]

    assert tools("vault").startswith("Read(**),Write(**),Edit(**)")
    assert tools("ephemeral") == "Read(**),Glob(**),Grep(**)"
    assert tools("research") == "WebSearch,WebFetch"  # not even reading the vault
    lib = tools("library")
    assert "Write(wiki/library/**)" in lib and "Write(**)" not in lib and "Web" not in lib


def test_a_current_question_becomes_research_and_is_saved_in_the_library(client, vault):
    r = client.post("/ask", json={"text": "RESEARCH: I want to move to Canada"}).json()
    assert r["tier"] == 3 and r["intent"] == "research" and "Moving to Canada" in r["reply"]
    s = tier3.manager(vault).get(r["session_id"])
    assert s.output == "research" and s.skill == "research"
    end = _wait_for_receipt(client, r["session_id"])
    assert end["status"] == "ok" and end["ephemeral_id"]

    e = client.get(f"/ephemeral/{end['ephemeral_id']}").json()
    assert e["title"] == "Research: Moving to Canada" and e["research"]["topic"] == "Moving to Canada"
    assert e["expires"] > "2026-10-09"  # research waits 7 days
    receipts = (vault / "receipts").rglob("*.md")
    assert all(e["text"] not in r.read_text(encoding="utf-8") for r in receipts)

    g = client.post(f"/research/{e['id']}/save")
    assert g.status_code == 201
    save = g.json()
    assert save["skill"] == "save-research" and save["output"] == "library"
    assert "<report>" in save["task"] and "Create a new topic" in save["task"]
    _wait_for_receipt(client, save["id"])
    assert client.get(f"/ephemeral/{e['id']}").status_code == 404  # saved: left "Summaries"


def test_research_skill_from_the_skills_tab_still_has_no_vault(client, vault):
    s = client.post("/skills/research/run", json={"instruction": "flights to Tokyo"}).json()
    assert s["output"] == "research"


def test_library_list_detail_and_checklist(client, vault):
    folder = vault / "wiki/library/japan-trip"
    folder.mkdir(parents=True)
    (folder / "_index.md").write_text(
        "---\ntype: plan\nupdated: 2026-10-02\n---\n# Trip to Japan\n\nTen days between Tokyo and Kyoto in April.\n", encoding="utf-8")
    (folder / "itinerary.md").write_text("---\norder: 1\n---\n# Itinerary\n\nDay 1…\n", encoding="utf-8")
    (folder / "budget.md").write_text("---\norder: 2\n---\n# Budget\n", encoding="utf-8")
    (folder / "checklist.md").write_text("# Checklist\n\n- [ ] Get a passport\n- [x] Buy a guidebook\n- [ ] Book the hotel 📅 2026-12-01\n", encoding="utf-8")

    [item] = client.get("/library").json()
    assert item == {"slug": "japan-trip", "title": "Trip to Japan", "kind": "plan",
                    "summary": "Ten days between Tokyo and Kyoto in April.", "updated": "2026-10-02", "part_count": 3}
    d = client.get("/library/japan-trip").json()
    assert [p["title"] for p in d["parts"]][:2] == ["Itinerary", "Budget"] and d["has_checklist"]
    assert client.post("/library/japan-trip/tasks").json()["created"] == ["Get a passport", "Book the hotel"]
    assert client.post("/library/japan-trip/tasks").json()["created"] == []  # no duplicates
    assert client.get("/library/../life").status_code == 404

    # update: the research gets what is already saved, but still has no vault
    s = client.post("/research", json={"request": "add a day in Nara", "update": "japan-trip"}).json()
    assert "<already_saved>" in s["task"] and "Ten days" in s["task"] and s["output"] == "research"
