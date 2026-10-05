"""Configuração do Bridge, carregada do .env na raiz do repositório."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    vault_path: Path
    host: str
    port: int
    token: str
    timezone: str
    # IA via Claude Code (assinatura do usuário)
    claude_bin: str
    tier2_model: str
    tier3_model: str
    tier3_timeout_min: float
    tier3_max_simultaneas: int
    limite_diario_chamadas: int
    # Saídas efêmeras: fora do vault e do git
    dados_path: Path
    efemero_horas: float
    # Voz (offline)
    whisper_modelo: str
    voz_tts: str
    voz_velocidade: float
    # Lembretes, notificações e criação de eventos (Fase 8)
    push_contato: str
    agendar_modelo: str


def _env(nome: str) -> str:
    """GANDALF_<nome>, aceitando o nome antigo JEV_<nome> (o assistente se chamava Jev)."""
    return (os.getenv(f"GANDALF_{nome}") or os.getenv(f"JEV_{nome}") or "").strip()


def _int(nome: str, padrao: int) -> int:
    valor = (_env(nome.removeprefix("GANDALF_")) if nome.startswith("GANDALF_") else os.getenv(nome, "")).strip()
    return int(valor) if valor else padrao


@lru_cache
def get_settings() -> Settings:
    load_dotenv(REPO_ROOT / ".env")
    vault = Path(os.getenv("VAULT_PATH") or REPO_ROOT / "vault")
    if not vault.is_absolute():
        vault = (REPO_ROOT / vault).resolve()
    return Settings(
        vault_path=vault,
        host=os.getenv("BRIDGE_HOST", "127.0.0.1"),
        port=_int("BRIDGE_PORT", 8787),
        token=os.getenv("BRIDGE_TOKEN", ""),
        timezone=os.getenv("TZ_NAME", "America/Sao_Paulo"),
        claude_bin=os.getenv("CLAUDE_BIN", "").strip(),
        tier2_model=_env("TIER2_MODEL") or "haiku",
        tier3_model=_env("TIER3_MODEL"),
        tier3_timeout_min=float(_env("TIER3_TIMEOUT_MIN") or 20),
        tier3_max_simultaneas=_int("GANDALF_TIER3_MAX_SIMULTANEAS", 2),
        limite_diario_chamadas=_int("GANDALF_LIMITE_DIARIO_CHAMADAS", 40),
        dados_path=Path(os.getenv("LIFEOS_DADOS") or REPO_ROOT / "bridge" / "dados"),
        efemero_horas=float(_env("EFEMERO_HORAS") or 48),
        whisper_modelo=_env("WHISPER_MODELO") or "medium",
        # Gandalf: mistura da voz brasileira mais velha com uma britânica grave, um pouco mais devagar.
        voz_tts=_env("VOZ") or "pm_santa:0.5+bm_lewis:0.5",
        voz_velocidade=float(_env("VOZ_VELOCIDADE") or 0.9),
        # Contato no token VAPID (exigido pelos serviços de push; não precisa ser real).
        push_contato=os.getenv("PUSH_CONTATO", "").strip() or "mailto:lifeos@users.noreply.github.com",
        agendar_modelo=_env("AGENDAR_MODELO") or "haiku",
    )
