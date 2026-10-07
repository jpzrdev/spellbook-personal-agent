"""Editing, search, backlinks, health check and web clipper of the memory (the HUD replaces Obsidian)."""

from pathlib import Path

import pytest

from app.gandalf import tier3
from app.memory import clip, links


def test_save_detects_a_concurrent_write(client, memory):
    path = "wiki/studies/calculus/limits.md"
    note = client.get("/memory/note", params={"path": path}).json()
    assert note["editable"] and note["raw"].startswith("---")

    saved = client.put("/memory/note", json={"path": path, "content": note["raw"] + "\nMore.\n", "base": note["version"]})
    assert saved.status_code == 200 and "More." in (memory / path).read_text(encoding="utf-8")

    # The editor still has the old version: Gandalf (or another device) wrote in between.
    stale = client.put("/memory/note", json={"path": path, "content": "overwritten", "base": note["version"]})
    assert stale.status_code == 409 and "More." in (memory / path).read_text(encoding="utf-8")


def test_receipts_are_read_only_and_paths_stay_inside(client, memory):
    (memory / "receipts" / "r.md").write_text("receipt", encoding="utf-8")
    assert client.get("/memory/note", params={"path": "receipts/r.md"}).json()["editable"] is False
    assert client.put("/memory/note", json={"path": "receipts/r.md", "content": "x"}).status_code == 400
    assert client.delete("/memory/note", params={"path": "receipts/r.md"}).status_code == 400
    assert client.post("/memory/note", json={"path": "../outside.md", "content": "x"}).status_code == 400
    assert client.post("/memory/note", json={"path": ".git/x.md", "content": "x"}).status_code == 400


def test_create_delete_to_trash(client, memory):
    r = client.post("/memory/note", json={"path": "wiki/personal/books", "content": "# Books\n"})
    assert r.status_code == 201 and r.json()["path"] == "wiki/personal/books.md"
    assert client.post("/memory/note", json={"path": "wiki/personal/books.md", "content": ""}).status_code == 409

    gone = client.delete("/memory/note", params={"path": "wiki/personal/books.md"}).json()
    assert gone["trash"] == ".trash/wiki/personal/books.md"
    assert not (memory / "wiki/personal/books.md").exists() and (memory / gone["trash"]).is_file()
    # .trash/ is hidden from the tree
    assert ".trash" not in [n["name"] for n in client.get("/memory/tree").json()]


def test_move_rewrites_links(client, memory):
    r = client.post("/memory/move", json={"src": "wiki/studies/calculus/limits.md", "dst": "wiki/studies/calculus/limits-and-continuity"})
    assert r.json()["path"] == "wiki/studies/calculus/limits-and-continuity.md"
    assert "wiki/studies/calculus/_index.md" in r.json()["updated_links"]
    index = (memory / "wiki/studies/calculus/_index.md").read_text(encoding="utf-8")
    assert "[[wiki/studies/calculus/limits-and-continuity]]" in index and "[[wiki/studies/calculus/limits]]" not in index


def test_rewrite_links_keeps_heading_and_alias():
    text = "See [[a/b|B]], [[a/b#Intro]], [[a/b.md]] and [[a/bc]]."
    assert links.rewrite_links(text, "a/b.md", "x/y.md") == "See [[x/y|B]], [[x/y#Intro]], [[x/y]] and [[a/bc]]."


def test_search_and_backlinks(client):
    results = client.get("/memory/search", params={"q": "limits"}).json()
    assert results[0]["path"] == "wiki/studies/calculus/limits.md"  # name matches come first
    assert any(r["path"] == "wiki/studies/calculus/_index.md" for r in results)

    back = client.get("/memory/backlinks", params={"path": "wiki/studies/calculus/limits.md"}).json()
    assert [b["path"] for b in back] == ["wiki/studies/calculus/_index.md"]


def test_health_finds_broken_links_orphans_and_raw_pending(client, memory):
    calculus = memory / "wiki/studies/calculus"
    (calculus / "integrals.md").write_text("# Integrals\nSee [[wiki/studies/calculus/series]].\n", encoding="utf-8")
    (memory / "raw" / "idea.md").write_text("an idea", encoding="utf-8")
    (memory / "raw" / "done.md").write_text("old", encoding="utf-8")
    (memory / "raw" / "_processed.md").write_text("- [[raw/done]] → x\n", encoding="utf-8")

    h = client.get("/memory/health").json()
    assert {"source": "wiki/studies/calculus/integrals.md", "target": "wiki/studies/calculus/series", "line": 2} in h["broken_links"]
    assert "wiki/studies/calculus/integrals.md" in h["orphans"]
    assert "wiki/studies/calculus/integrals.md" in h["unindexed"]
    assert "wiki/studies/calculus/integrals.md" in h["no_frontmatter"]
    assert h["raw_pending"] == ["raw/idea.md"]
    assert "wiki/studies/calculus/limits.md" not in h["orphans"]

    report = links.health_report(memory)
    assert "Broken links: 1" in report and "→ [[wiki/studies/calculus/series]]" in report


def test_lint_skill_gets_the_health_report(memory, tmp_path):
    skill = tmp_path / "skills" / "lint-wiki"
    skill.mkdir()
    (skill / "SKILL.md").write_text("---\nname: lint-wiki\ndescription: d\ncontext: memory-health\n---\nLint.\n", encoding="utf-8")
    m = tier3.Manager(memory)
    s = tier3.Session(id="x", task="t", request="p", source="routine", created=None, skill="lint-wiki")
    prompt = m._prompt(s)
    assert prompt.startswith("/gandalf:lint-wiki t") and "<memory_health>" in prompt and "Wiki notes:" in prompt


def test_lint_skill_ships_with_the_project():
    root = Path(__file__).resolve().parents[2]
    text = (root / "skills" / "lint-wiki" / "SKILL.md").read_text(encoding="utf-8")
    assert "context: memory-health" in text
    assert "!/lint-wiki/" in (root / "skills" / ".gitignore").read_text(encoding="utf-8")
    assert (root / "memory-template" / "life" / "routines" / "lint-wiki.md").is_file()


PAGE = """<html><head><title>How limits work</title></head><body><nav>menu</nav>
<article><h1>How limits work</h1><p>A limit describes the value a function approaches as the input approaches some
value. Limits are the foundation of calculus and are used to define derivatives and integrals.</p>
<p>They also help with continuity: a function is continuous where its limit equals its value.</p></article></body></html>"""


def test_clip_saves_the_page_in_raw(client, memory, monkeypatch):
    monkeypatch.setattr(clip, "fetch", lambda url: ("https://example.com/limits", PAGE))
    r = client.post("/raw/url", json={"url": "https://example.com/limits", "note": "for calculus"})
    assert r.status_code == 201
    text = (memory / r.json()["file"]).read_text(encoding="utf-8")
    assert r.json()["file"].startswith("raw/2026-10-03-091512-how-limits-work")
    assert "type: clip" in text and 'url: "https://example.com/limits"' in text
    assert "> for calculus" in text and "foundation of calculus" in text


@pytest.mark.parametrize("url", ["http://127.0.0.1:8787/api/health", "http://localhost/", "file:///etc/passwd", "http://10.0.0.1/"])
def test_clip_refuses_local_addresses(client, url):
    r = client.post("/raw/url", json={"url": url})
    assert r.status_code == 422


def test_a_link_by_name_finds_the_note(client):
    note = client.get("/memory/note", params={"path": "derivatives.md"}).json()
    assert note["path"] == "wiki/studies/calculus/derivatives.md"
    assert client.get("/memory/note", params={"path": "nothing.md"}).status_code == 404


def test_links_in_code_are_examples(memory):
    (memory / "wiki" / "rules.md").write_text("Write links as `[[path/note]]`.\n```\n[[also/not]]\n```\n", encoding="utf-8")
    assert not [x for x in links.links(memory) if x.source == "wiki/rules.md"]
