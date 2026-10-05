import time
from pathlib import Path

import frontmatter
import pytest

from app.gandalf import claude_cli


def wait_for_end(client, session_id: str, timeout: float = 15) -> dict:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        s = client.get(f"/sessions/{session_id}").json()
        if s["status"] not in ("queued", "running"):
            return s
        time.sleep(0.1)
    raise AssertionError(f"session {session_id} did not finish")


def receipts(vault: Path) -> list[frontmatter.Post]:
    return [frontmatter.load(p) for p in sorted((vault / "receipts").rglob("*.md"))]


def test_tier1_still_goes_first(client):
    r = client.post("/ask", json={"text": "my priorities"}).json()
    assert r["tier"] == 1


def test_tier2_answers_and_writes_a_receipt_with_tokens(client, vault):
    r = client.post("/ask", json={"text": "what is a derivative?"}).json()
    assert r["tier"] == 2 and r["intent"] == "answer"
    assert "rate of change" in r["reply"]
    [rec] = receipts(vault)
    assert rec["tier"] == 2 and rec["model"] == "claude-haiku-4-5"
    assert rec["input_tokens"] == 150 and rec["output_tokens"] == 20
    assert rec["estimated_cost_usd"] == pytest.approx(0.0011)


def test_tier2_system_prompt_carries_the_language(client, pt_br):
    from app.gandalf import tier2

    assert "The user speaks Brazilian Portuguese (pt-BR)" in tier2.system_prompt()


def test_tier2_invalid_json_retries_and_uses_the_text(client, vault):
    r = client.post("/ask", json={"text": "INVALID please"}).json()
    assert r["tier"] == 2 and r["reply"] == "Hello! I don't speak JSON."
    [rec] = receipts(vault)
    assert rec["input_tokens"] == 300  # both attempts added up


def test_escalates_to_tier3_with_stream_file_and_receipt(client, vault):
    r = client.post("/ask", json={"text": "ESCALATE: organize my raw"}).json()
    assert r["tier"] == 3 and r["session_id"]
    s = wait_for_end(client, r["session_id"])
    assert s["status"] == "ok"
    assert s["files"] == ["output/test-report.md"]
    assert (vault / "output" / "test-report.md").read_text(encoding="utf-8").startswith("# Report")
    assert s["claude_session_id"] and s["model"] == "claude-sonnet-5-5"

    [rec] = receipts(vault)  # a single receipt per request
    assert rec["tier"] == 3 and rec["claude_code_session"] == s["claude_session_id"]
    assert rec["input_tokens"] == 300  # Tier 2 (150) + Tier 3 (150)
    assert "## Request\nESCALATE: organize my raw" in rec.content
    assert "`output/test-report.md`" in rec.content


def test_ws_stream_delivers_buffer_and_end(client):
    sid = client.post("/ask", json={"text": "do something", "force_tier": 3}).json()["session_id"]
    wait_for_end(client, sid)
    from tests.conftest import TOKEN

    with client.websocket_connect(f"/ws/stream/{sid}?token={TOKEN}", headers={"Authorization": ""}) as ws:
        types = []
        while True:
            ev = ws.receive_json()
            types.append(ev["type"])
            if ev["type"] == "gandalf_end":
                break
    assert types[0] == "gandalf_status"
    assert {"system", "assistant", "result", "gandalf_text"} <= set(types)


def test_ws_requires_token(client):
    sid = client.post("/ask", json={"text": "x", "force_tier": 3}).json()["session_id"]
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/stream/{sid}?token=wrong", headers={"Authorization": ""}) as ws:
            ws.receive_json()
    wait_for_end(client, sid)


def test_cancel_session(client, vault):
    sid = client.post("/ask", json={"text": "SLOW for a while", "force_tier": 3}).json()["session_id"]
    time.sleep(0.8)
    assert client.delete(f"/sessions/{sid}").json()["id"] == sid
    s = wait_for_end(client, sid)
    assert s["status"] == "cancelled"
    assert receipts(vault)[0]["tier"] == 3


def test_queue_respects_the_limit(client, monkeypatch):
    from app import config

    monkeypatch.setenv("GANDALF_TIER3_MAX_CONCURRENT", "1")
    config.get_settings.cache_clear()
    a = client.post("/ask", json={"text": "SLOW 1", "force_tier": 3}).json()["session_id"]
    b = client.post("/ask", json={"text": "second", "force_tier": 3}).json()["session_id"]
    assert client.get(f"/sessions/{b}").json()["status"] == "queued"
    client.delete(f"/sessions/{a}")
    assert wait_for_end(client, b)["status"] == "ok"


def test_failure_becomes_error(client):
    sid = client.post("/ask", json={"text": "FAIL now", "force_tier": 3}).json()["session_id"]
    s = wait_for_end(client, sid)
    assert s["status"] == "error" and s["error"]


def test_continue_resumes_the_claude_session(client):
    sid = client.post("/ask", json={"text": "first", "force_tier": 3}).json()["session_id"]
    s1 = wait_for_end(client, sid)
    new = client.post(f"/sessions/{sid}/continue", json={"text": "and now summarize"}).json()
    s2 = wait_for_end(client, new["id"])
    assert s2["resumed_from"] == sid
    assert s2["claude_session_id"] == s1["claude_session_id"]  # passed --resume


def test_daily_limit_asks_for_confirmation(client, monkeypatch, vault):
    from app import config

    monkeypatch.setenv("GANDALF_DAILY_CALL_LIMIT", "1")
    config.get_settings.cache_clear()
    assert client.post("/ask", json={"text": "question 1"}).json()["tier"] == 2
    r = client.post("/ask", json={"text": "question 2"}).json()
    assert r["needs_confirmation"] and r["tier"] == 0
    assert client.post("/ask", json={"text": "question 2", "confirm": True}).json()["tier"] == 2


def test_claude_unavailable_becomes_503(client, monkeypatch):
    def no_claude():
        raise claude_cli.ClaudeUnavailable("Claude Code not found")

    monkeypatch.setattr(claude_cli, "resolve_command", no_claude)
    r = client.post("/ask", json={"text": "explain integrals"})
    assert r.status_code == 503 and "not found" in r.json()["detail"]


def test_ws_missing_session_closes_with_1008(client):
    from starlette.websockets import WebSocketDisconnect

    from tests.conftest import TOKEN

    with pytest.raises(WebSocketDisconnect) as error:
        with client.websocket_connect(f"/ws/stream/doesnotexist?token={TOKEN}", headers={"Authorization": ""}) as ws:
            ws.receive_json()
    assert error.value.code == 1008
