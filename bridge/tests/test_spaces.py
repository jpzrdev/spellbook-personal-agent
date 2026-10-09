import json
import time

import frontmatter
import pytest

from app import modules
from app.gandalf import context, tier3
from app.spaces import store
from app.spaces.store import InvalidSpace


def wait_all(client, count: int, timeout: float = 15) -> list[dict]:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        sessions = client.get("/sessions").json()
        if len(sessions) >= count and all(s["status"] not in ("queued", "running") for s in sessions):
            return sessions
        time.sleep(0.1)
    raise AssertionError("sessions did not finish")


@pytest.fixture
def skills(tmp_path):
    """The page modules' skills (the test fixture has only a few skills)."""
    for name in modules.PAGES:
        folder = tmp_path / "skills" / name
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "SKILL.md").write_text(f"---\nname: {name}\ndescription: Keeps {name}.\n---\n# {name}\n", encoding="utf-8")


def test_every_page_module_is_valid_and_documented():
    for pid in modules.PAGES:
        t = store.template(pid)
        assert t["samples"] and t["guide"], pid
        for action in t["config"]["actions"]:
            assert action["label"] in t["guide"], (pid, action["label"])  # every button is explained
        for block in t["config"]["item"]:
            if block.get("section"):
                assert (block.get("title") or block["section"]) in t["guide"], (pid, block)


@pytest.mark.parametrize(
    "config, message",
    [
        ({"name": "X", "item": []}, "item"),
        ({"name": "X", "item": [{"block": "map", "section": "A"}]}, "item.0"),
        ({"name": "X", "collection": {"view": "kanban"}, "item": [{"block": "markdown", "section": "A"}]}, "group_by"),
        ({"name": "X", "fields": [{"key": "s", "label": "S", "type": "select"}], "item": [{"block": "properties"}]}, "options"),
        ({"name": "X", "collection": {"show": ["nope"]}, "item": [{"block": "properties"}]}, "unknown field `nope`"),
        ({"name": "X", "icon": "rocket-ship", "item": [{"block": "properties"}]}, "icon"),
        ({"name": "X", "item": [{"block": "properties"}], "html": "<div>"}, "html"),
        # buttons always say what they do and where the result goes
        ({"name": "X", "item": [{"block": "properties"}], "actions": [{"label": "Go", "kind": "skill", "skill": "x", "task": "t", "section": "A"}]}, "description"),
        ({"name": "X", "item": [{"block": "properties"}], "actions": [{"label": "Go", "description": "d", "prompt": "do it"}]}, "kind"),
        ({"name": "X", "item": [{"block": "properties"}], "actions": [{"label": "Go", "description": "d", "kind": "skill", "skill": "x", "task": "t"}]}, "section"),
        ({"name": "X", "item": [{"block": "properties"}], "actions": [{"label": "Go", "description": "d", "kind": "row", "section": "Log"}]}, "columns"),
    ],
)
def test_the_catalog_is_closed(config, message):
    with pytest.raises(InvalidSpace) as e:
        store.parse(config)
    assert any(message in p for p in e.value.problems), e.value.problems


def test_modules_start_with_the_screens_on(client, memory):
    mods = {m["id"]: m for m in client.get("/modules").json()}
    assert [k for k, m in mods.items() if m["active"]] == ["studies", "library"]
    assert mods["workouts"]["kind"] == "page" and mods["workouts"]["route"] == "/p/workouts"
    assert not (memory / "spaces").exists()


def test_turning_a_page_module_on_and_off(client, memory):
    client.put("/modules/workouts", json={"active": True})
    assert json.loads((memory / "modules.json").read_text())["active"] == ["studies", "library", "workouts"]
    assert (memory / "spaces/workouts/space.yaml").is_file()
    assert "Log session" in (memory / "spaces/workouts/_guide.md").read_text(encoding="utf-8")
    page = client.get("/spaces/workouts").json()
    assert page["items"] == [] and "Suggest next loads" in page["guide"]

    # the user's changes to the page survive turning it off and on
    config = page["config"]
    config["collection"]["view"] = "table"
    client.put("/spaces/workouts/config", json={"config": config})
    client.put("/modules/workouts", json={"active": False})
    client.put("/modules/studies", json={"active": False})
    assert json.loads((memory / "modules.json").read_text())["active"] == ["library"]
    client.put("/modules/workouts", json={"active": True})
    assert client.get("/spaces/workouts").json()["config"]["collection"]["view"] == "table"
    assert client.put("/modules/nope", json={"active": True}).status_code == 404
    assert client.get("/modules/workouts/preview").json()["samples"][0]["title"] == "Upper A"
    assert client.get("/modules/studies/preview").status_code == 404


def test_the_assistant_knows_the_pages_that_are_on(client, memory, now):
    client.put("/modules/recipes", json={"active": True})
    text = context.build_context(memory, now)
    assert "### Recipes (on; HUD: /p/recipes)" in text and "Adapt servings" in text and "`recipes` skill" in text
    assert "Off (the user can turn them on in Modules): Workouts, Reading." in text


def test_items_rows_and_checks(client, memory):
    client.put("/modules/workouts", json={"active": True})
    item = client.post("/spaces/workouts/items", json={"title": "Pernas", "fields": {"focus": "lower"}}).json()["id"]
    note = frontmatter.load(memory / "spaces/workouts" / f"{item}.md")
    assert note.metadata == {"focus": "lower"} and "## Exercises" in note.content and "## Log" in note.content

    # Log session: a row in a table that didn't exist yet, and "Last done"
    r = client.post("/spaces/workouts/actions/0", json={"item": item, "values": {"Date": "2026-10-02", "Exercise": "Squat", "Load (kg)": "60", "Reps": "8|x"}}).json()
    assert r["item"]["fields"]["last_done"] == "2026-10-02"
    assert r["item"]["sections"]["Log"].splitlines() == [
        "| Date | Exercise | Sets | Reps | Load (kg) |", "|---|---|---|---|---|", "| 2026-10-02 | Squat |  | 8/x | 60 |"]
    r = client.post("/spaces/workouts/actions/0", json={"item": item, "values": {"date": "2026-10-03", "exercise": "Lunge"}}).json()
    assert r["item"]["sections"]["Log"].splitlines()[-1] == "| 2026-10-03 | Lunge |  |  |  |"
    assert client.post("/spaces/workouts/actions/0", json={"item": item, "values": {}}).status_code == 422
    assert client.post("/spaces/workouts/actions/0", json={}).status_code == 422  # an item action without an item

    assert client.patch(f"/spaces/workouts/items/{item}", json={"fields": {"focus": "arms"}}).status_code == 422


def test_shopping_list_becomes_tasks(client, memory):
    client.put("/modules/recipes", json={"active": True})
    item = client.post("/spaces/recipes/items", json={"title": "Bolo"}).json()["id"]
    path = memory / "spaces/recipes" / f"{item}.md"
    path.write_text(path.read_text(encoding="utf-8").replace("## Ingredients\n", "## Ingredients\n- 3 ovos\n- [x] farinha\n  - nested\n- açúcar\n"), encoding="utf-8")
    r = client.patch(f"/spaces/recipes/items/{item}", json={"check": {"section": "ingredients", "index": 0, "done": True}}).json()
    assert r["sections"]["Ingredients"].startswith("- [x] 3 ovos")
    created = client.post("/spaces/recipes/actions/0", json={"item": item}).json()["created"]
    assert created == ["açúcar"]
    assert any("açúcar" in t["text"] and "shopping" in t["tags"] for t in client.get("/tasks").json())
    assert client.post("/spaces/recipes/actions/0", json={"item": item}).json()["created"] == []


def test_a_skill_button_runs_on_the_item(client, memory, skills):
    client.put("/modules/reading", json={"active": True})
    item = client.post("/spaces/reading/items", json={"title": "Dune"}).json()["id"]
    s = client.post("/spaces/reading/actions/0", json={"item": item}).json()["session"]
    assert s["skill"] == "reading" and s["target"] == f"spaces/reading/{item}.md"
    assert "`## Summary` section" in s["task"] and "spaces/reading/_guide.md" in s["task"]


def test_a_skill_button_needs_its_skill(client):
    client.put("/modules/reading", json={"active": True})
    item = client.post("/spaces/reading/items", json={"title": "Dune"}).json()["id"]
    r = client.post("/spaces/reading/actions/0", json={"item": item})
    assert r.status_code == 422 and "reading" in r.json()["detail"]


def test_a_broken_page_shows_its_errors(client, memory):
    (memory / "spaces" / "broken").mkdir(parents=True)
    (memory / "spaces" / "broken" / "space.yaml").write_text("name: Broken\nitem: []\n", encoding="utf-8")
    [summary] = client.get("/spaces").json()
    assert summary["errors"] and summary["draft"]
    assert client.get("/spaces/broken").json()["config"] is None


def test_a_page_that_fails_validation_goes_back_to_gandalf(client, memory):
    tier3.manager(memory).create("SPACE for my notes")
    sessions = wait_all(client, 2)
    time.sleep(0.3)  # time for a (wrong) third round to show up
    sessions = wait_all(client, 2)
    fix = next(s for s in sessions if s["resumed_from"])
    assert fix["request"] == "Fix page: demo"
    assert "<space_errors>" in fix["task"] and "group_by" in fix["task"]
    assert store.problems(memory, "demo") == []
    assert len(sessions) == 2  # valid now: no third round
