import shutil
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app import clock, config, reminders
from app.gandalf import claude_cli, tier3
from app.routines import scheduler

FIXTURE = Path(__file__).parent / "fixtures" / "memory"
SKILLS_FIXTURE = Path(__file__).parent / "fixtures" / "skills"
TZ = ZoneInfo("America/Sao_Paulo")
# Saturday, October 3, 2026, 09:15.
NOW = datetime(2026, 10, 3, 9, 15, 12, tzinfo=TZ)
TOKEN = "secret"
FAKE_CLAUDE = Path(__file__).parent / "fake_claude.py"


@pytest.fixture(autouse=True)
def fake_claude(monkeypatch, tmp_path):
    """No test calls the real Claude Code or writes to bridge/data/ or skills/. The assistant speaks English by default."""
    monkeypatch.setenv("GANDALF_DATA_DIR", str(tmp_path / "data"))
    shutil.copytree(SKILLS_FIXTURE, tmp_path / "skills")
    monkeypatch.setenv("GANDALF_SKILLS_DIR", str(tmp_path / "skills"))
    monkeypatch.setenv("GANDALF_VOICE_PRELOAD", "0")
    monkeypatch.setenv("GANDALF_LANGUAGE", "en")
    monkeypatch.setenv("TZ_NAME", "America/Sao_Paulo")
    config.get_settings.cache_clear()
    monkeypatch.setattr(claude_cli, "resolve_command", lambda: [sys.executable, str(FAKE_CLAUDE)])
    monkeypatch.setenv("GANDALF_SCHEDULER", "0")
    tier3._managers.clear()
    scheduler.reset()
    reminders.reset()
    yield
    tier3._managers.clear()
    scheduler.reset()
    reminders.reset()
    config.get_settings.cache_clear()


@pytest.fixture
def pt_br(monkeypatch):
    """The assistant speaks Brazilian Portuguese (Tier 1 rules and replies in pt-BR)."""
    monkeypatch.setenv("GANDALF_LANGUAGE", "pt-BR")
    config.get_settings.cache_clear()


@pytest.fixture
def memory(tmp_path: Path) -> Path:
    target = tmp_path / "memory"
    shutil.copytree(FIXTURE, target)
    return target


@pytest.fixture
def now(monkeypatch) -> datetime:
    monkeypatch.setattr(clock, "now", lambda: NOW)
    return NOW


@pytest.fixture
def client(monkeypatch, memory: Path, now) -> TestClient:
    monkeypatch.setenv("BRIDGE_TOKEN", TOKEN)
    monkeypatch.setenv("MEMORY_PATH", str(memory))
    config.get_settings.cache_clear()
    from app.main import app

    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {TOKEN}"
    yield c
    config.get_settings.cache_clear()
