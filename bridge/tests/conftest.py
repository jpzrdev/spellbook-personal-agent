import shutil
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app import clock, config, lembretes
from app.gandalf import claude_cli, tier3
from app.routines import scheduler

FIXTURE = Path(__file__).parent / "fixtures" / "vault"
TZ = ZoneInfo("America/Sao_Paulo")
# Sábado, 3 de outubro de 2026, 09:15.
AGORA = datetime(2026, 10, 3, 9, 15, 12, tzinfo=TZ)
TOKEN = "segredo"
FAKE_CLAUDE = Path(__file__).parent / "fake_claude.py"


@pytest.fixture(autouse=True)
def claude_falso(monkeypatch, tmp_path):
    """Nenhum teste chama o Claude Code de verdade nem grava em bridge/dados/."""
    monkeypatch.setenv("LIFEOS_DADOS", str(tmp_path / "dados"))
    monkeypatch.setenv("LIFEOS_VOZ_PRECARGA", "0")
    config.get_settings.cache_clear()
    monkeypatch.setattr(claude_cli, "resolver_comando", lambda: [sys.executable, str(FAKE_CLAUDE)])
    monkeypatch.setenv("LIFEOS_AGENDADOR", "0")
    tier3._gerenciadores.clear()
    scheduler.resetar()
    lembretes.resetar()
    yield
    tier3._gerenciadores.clear()
    scheduler.resetar()
    lembretes.resetar()


@pytest.fixture
def vault(tmp_path: Path) -> Path:
    destino = tmp_path / "vault"
    shutil.copytree(FIXTURE, destino)
    return destino


@pytest.fixture
def agora(monkeypatch) -> datetime:
    monkeypatch.setattr(clock, "now", lambda: AGORA)
    return AGORA


@pytest.fixture
def client(monkeypatch, vault: Path, agora) -> TestClient:
    monkeypatch.setenv("BRIDGE_TOKEN", TOKEN)
    monkeypatch.setenv("VAULT_PATH", str(vault))
    config.get_settings.cache_clear()
    from app.main import app

    c = TestClient(app)
    c.headers["Authorization"] = f"Bearer {TOKEN}"
    yield c
    config.get_settings.cache_clear()
