"""Bridge settings, loaded from the .env at the repository root."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

# Languages the assistant can speak. The code and the HUD are always in English; this only changes
# how Gandalf talks to the user and the language of the notes it writes in the vault.
LANGUAGES = ("en", "pt-BR")


@dataclass(frozen=True)
class Settings:
    vault_path: Path
    host: str
    port: int
    token: str
    timezone: str
    language: str
    # AI through Claude Code (the user's subscription)
    claude_bin: str
    tier2_model: str
    tier3_model: str
    tier3_timeout_min: float
    tier3_max_concurrent: int
    daily_call_limit: int
    # Ephemeral outputs: outside the vault and git
    data_path: Path
    ephemeral_hours: float
    # Voice (offline)
    whisper_model: str
    tts_voice: str
    voice_speed: float
    # Reminders, notifications and event creation
    push_contact: str
    schedule_event_model: str


def _env(name: str) -> str:
    return os.getenv(f"GANDALF_{name}", "").strip()


def _int(name: str, default: int) -> int:
    value = _env(name)
    return int(value) if value else default


def _language(value: str) -> str:
    """Accepts "pt", "pt-br", "pt_BR"… and falls back to English."""
    value = value.strip().replace("_", "-").lower()
    if value.startswith("pt"):
        return "pt-BR"
    return "en"


# Default Kokoro voice per language. Gandalf in Portuguese mixes the older Brazilian voice with a
# deep British one; in English, a deep British voice.
DEFAULT_VOICE = {"pt-BR": "pm_santa:0.5+bm_lewis:0.5", "en": "bm_lewis"}


@lru_cache
def get_settings() -> Settings:
    load_dotenv(REPO_ROOT / ".env")
    vault = Path(os.getenv("VAULT_PATH") or REPO_ROOT / "vault")
    if not vault.is_absolute():
        vault = (REPO_ROOT / vault).resolve()
    language = _language(_env("LANGUAGE") or "en")
    return Settings(
        vault_path=vault,
        host=os.getenv("BRIDGE_HOST", "127.0.0.1"),
        port=int(os.getenv("BRIDGE_PORT") or 8787),
        token=os.getenv("BRIDGE_TOKEN", ""),
        timezone=os.getenv("TZ_NAME", "America/Sao_Paulo"),
        language=language,
        claude_bin=os.getenv("CLAUDE_BIN", "").strip(),
        tier2_model=_env("TIER2_MODEL") or "haiku",
        tier3_model=_env("TIER3_MODEL"),
        tier3_timeout_min=float(_env("TIER3_TIMEOUT_MIN") or 20),
        tier3_max_concurrent=_int("TIER3_MAX_CONCURRENT", 2),
        daily_call_limit=_int("DAILY_CALL_LIMIT", 40),
        data_path=Path(_env("DATA_DIR") or REPO_ROOT / "bridge" / "data"),
        ephemeral_hours=float(_env("EPHEMERAL_HOURS") or 48),
        whisper_model=_env("WHISPER_MODEL") or "medium",
        tts_voice=_env("VOICE") or DEFAULT_VOICE[language],
        # Gandalf speaks a little slower than the default.
        voice_speed=float(_env("VOICE_SPEED") or 0.9),
        # Contact in the VAPID token (required by push services; does not need to be real).
        push_contact=os.getenv("PUSH_CONTACT", "").strip() or "mailto:gandalf@users.noreply.github.com",
        schedule_event_model=_env("SCHEDULE_EVENT_MODEL") or "haiku",
    )
