import logging

from fastapi.testclient import TestClient

from tests.conftest import TOKEN


def test_receipts_costs_and_reading(client):
    client.post("/ask", json={"text": "what do I have today?"})  # tier 1
    client.post("/ask", json={"text": "explain integrals"})  # tier 2 (fake CLI)
    receipts = client.get("/receipts").json()
    # Same time (the tests' fixed clock): only check that both came back.
    assert sorted(r["tier"] for r in receipts) == [1, 2]
    assert [r["tier"] for r in client.get("/receipts?tier=1").json()] == [1]
    assert client.get("/receipts?source=voice").json() == []

    tier2 = next(r for r in receipts if r["tier"] == 2)
    assert tier2["request"] == "explain integrals"
    detail = client.get(f"/receipts/{tier2['id']}").json()
    assert detail["metadata"]["tier"] == 2 and "## Request\nexplain integrals" in detail["text"]
    assert client.get("/receipts/doesnotexist").status_code == 404

    c = client.get("/costs").json()
    assert c["today"]["calls"] == {"1": 1, "2": 1, "3": 0}
    assert c["month"]["tokens"] == 170 and c["month"]["estimated_cost_usd"] == 0.0011
    assert c["by_day"][-1]["day"] == "2026-10-03"


def test_memory_tree_and_note(client):
    tree = client.get("/memory/tree").json()
    names = [n["name"] for n in tree]
    assert names[:3] == ["life", "output", "raw"]
    assert ".git" not in names
    life = next(n for n in tree if n["name"] == "life")
    assert any(f["path"] == "life/tasks.md" for f in life["children"])

    note = client.get("/memory/note", params={"path": "life/agenda/2026-10-03.md"}).json()
    assert note["metadata"]["date"] == "2026-10-03" and "Dentist" in note["text"]


def test_memory_does_not_leave_the_folder(client):
    for path in ("../.env", "life/../../secret.md", ".git/config", "/etc/passwd"):
        r = client.get("/memory/note", params={"path": path})
        assert r.status_code in (400, 404), path
    assert client.get("/memory/note", params={"path": "does/not/exist.md"}).status_code == 404


def test_single_server_serves_hud_and_api(monkeypatch, memory, tmp_path):
    from app import config
    from app.server import create

    monkeypatch.setenv("BRIDGE_TOKEN", TOKEN)
    monkeypatch.setenv("MEMORY_PATH", str(memory))
    config.get_settings.cache_clear()
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>HUD</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")

    with TestClient(create(dist)) as c:
        h = {"Authorization": f"Bearer {TOKEN}"}
        assert c.get("/api/health", headers=h).json()["status"] == "ok"
        assert c.get("/api/health").status_code == 401
        assert c.get("/").text == "<html>HUD</html>"
        assert c.get("/routines").text == "<html>HUD</html>"  # a React Router route
        assert c.get("/assets/app.js").text == "console.log(1)"
        assert c.get("/api/does-not-exist", headers=h).status_code == 404  # the API doesn't fall back to index.html
        with c.websocket_connect(f"/api/ws/events?token={TOKEN}"):
            pass


def test_logs_without_token():
    from app.server import _NoToken

    rec = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s"', ("127.0.0.1", "WebSocket", "/api/ws/stream/x?token=abc123&y=1"), None)
    _NoToken().filter(rec)
    assert rec.getMessage() == '127.0.0.1 - "WebSocket /api/ws/stream/x?token=***&y=1"'
