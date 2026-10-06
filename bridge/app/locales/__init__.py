"""The assistant's language: what Gandalf says and the notes it writes in the vault.

Code, API and HUD are always in English. `GANDALF_LANGUAGE` (en | pt-BR) picks one of these modules,
which hold the Tier 1 rules (regexes for commands, dates and times) and the replies built without AI.
"""

from datetime import date
from types import ModuleType

from app.config import get_settings
from app.locales import en, pt_br

LOCALES: dict[str, ModuleType] = {"en": en, "pt-BR": pt_br}


def current() -> ModuleType:
    return LOCALES[get_settings().language]


def get(language: str) -> ModuleType:
    return LOCALES.get(language, en)


def t(key: str, **kwargs) -> str:
    """Message in the user's language."""
    return current().MESSAGES[key].format(**kwargs)


def date_long(d: date, language: str | None = None) -> str:
    return (get(language) if language else current()).date_long(d)
