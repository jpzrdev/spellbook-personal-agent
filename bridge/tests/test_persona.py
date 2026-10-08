import json

from app import persona
from app.gandalf import claude_cli, tier2


def test_default_agent_until_setup(memory):
    agent = persona.load(memory)
    assert agent.name == "Gandalf" and agent.gender == "male" and agent.setup_done is None
    assert agent.avatar == persona.DEFAULT_AVATAR


def test_save_agent_cleans_values(memory):
    agent = persona.save_agent(memory, "  Morgana   le Fay ", "female", {"hat": "#112233", "robe": "red", "x": "#000000"})
    assert agent.name == "Morgana le Fay"
    assert agent.kind == "witch"
    assert agent.avatar["hat"] == "#112233"
    assert agent.avatar["robe"] == persona.DEFAULT_AVATAR["robe"]  # not a hex color
    assert "x" not in agent.avatar
    assert json.loads((memory / "agent.json").read_text(encoding="utf-8"))["name"] == "Morgana le Fay"
    assert persona.load(memory).name == "Morgana le Fay"


def test_user_profile_keeps_the_rest(memory):
    profile = memory / persona.PROFILE
    profile.parent.mkdir(parents=True)
    profile.write_text("# Profile\n\nIntro.\n\n- Goals: learn calculus.\n\n## Notes\n\nKeep me.\n", encoding="utf-8")
    persona.save_user(memory, "Ana", "I work as a nurse.\nNight shifts.")
    text = profile.read_text(encoding="utf-8")
    assert text.index("- Name: Ana") < text.index("- Goals: learn calculus.")
    assert "## Notes\n\nKeep me." in text
    assert persona.user(memory) == {"name": "Ana", "about": "I work as a nurse.\nNight shifts."}

    # editing again replaces, never duplicates
    persona.save_user(memory, "Ana Clara", "Day shifts now.")
    text = profile.read_text(encoding="utf-8")
    assert text.count("- Name:") == 1 and text.count(persona.ABOUT_HEADING) == 1
    assert persona.user(memory) == {"name": "Ana Clara", "about": "Day shifts now."}
    persona.save_user(memory, "Ana Clara", "")
    assert persona.ABOUT_HEADING not in profile.read_text(encoding="utf-8")


def test_placeholder_name_is_not_a_name(memory):
    (memory / persona.PROFILE).parent.mkdir(parents=True)
    (memory / persona.PROFILE).write_text("# Profile\n\n- Name: _fill in_.\n", encoding="utf-8")
    assert persona.user(memory)["name"] == ""


def test_prompts_use_the_chosen_name(client, memory):
    persona.save_agent(memory, "Morgana", "female", {})
    prompt = tier2.system_prompt()
    assert "You are **Morgana**" in prompt and "warm witch" in prompt
    assert "Gandalf" not in prompt and "{{" not in prompt
    assert "Morgana" in persona.identity_instruction()


def test_parse_mcp_list():
    out = (
        "Checking MCP server health…\n\n"
        "claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - ✔ Connected\n"
        "claude.ai Google Calendar: https://calendarmcp.googleapis.com/mcp/v1 - ✗ Failed to connect\n"
        "local: npx some-server - ✔ Connected\n"
    )
    servers = persona.parse_mcp_list(out)
    assert [s["name"] for s in servers] == ["claude.ai Gmail", "claude.ai Google Calendar", "local"]
    google = persona.google_connectors(servers)
    assert google["gmail"] == {"found": True, "connected": True, "name": "claude.ai Gmail"}
    assert google["calendar"]["found"] and not google["calendar"]["connected"]


def _logged_in(monkeypatch, logged_in=True):
    monkeypatch.setattr(claude_cli, "login_status", lambda: {"installed": True, "logged_in": logged_in, "method": "claude.ai"})


def test_setup_flow(client, memory, monkeypatch):
    _logged_in(monkeypatch)
    status = client.get("/setup?refresh=true").json()
    assert status["done"] is False and status["agent"]["name"] == "Gandalf"
    assert status["claude"]["logged_in"] is True

    assert client.post("/setup/finish").status_code == 409  # no name yet

    r = client.put("/setup/agent", json={"name": "Merlin", "gender": "male", "avatar": {"gem": "#3366ff"}})
    assert r.status_code == 200 and r.json()["avatar"]["gem"] == "#3366ff"
    assert client.post("/setup/finish").status_code == 409  # the user's name is missing

    r = client.put("/setup/user", json={"name": "João", "about": "Engineer."})
    assert r.json() == {"name": "João", "about": "Engineer."}
    r = client.post("/setup/finish")
    assert r.status_code == 200 and r.json()["setup_done"]

    status = client.get("/setup").json()
    assert status["done"] is True and status["user"]["name"] == "João"
    assert client.get("/agent").json()["name"] == "Merlin"


def test_setup_needs_claude(client, monkeypatch):
    _logged_in(monkeypatch, logged_in=False)
    client.put("/setup/agent", json={"name": "Merlin", "gender": "male"})
    client.put("/setup/user", json={"name": "João"})
    assert client.post("/setup/finish").status_code == 409


def test_setup_creates_missing_memory(client, memory, monkeypatch, tmp_path):
    from app import config

    target = tmp_path / "fresh"
    monkeypatch.setenv("MEMORY_PATH", str(target))
    config.get_settings.cache_clear()
    assert client.put("/setup/user", json={"name": "João"}).status_code == 200
    assert (target / "CLAUDE.md").is_file()
    assert "- Name: João" in (target / persona.PROFILE).read_text(encoding="utf-8")


def test_connectors_route(client, monkeypatch):
    monkeypatch.setattr(claude_cli, "mcp_list", lambda cwd: "claude.ai Gmail: https://x - ✔ Connected\n")
    r = client.get("/setup/connectors").json()
    assert r["gmail"]["connected"] is True and r["calendar"]["found"] is False
