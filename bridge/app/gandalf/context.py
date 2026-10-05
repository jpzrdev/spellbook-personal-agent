"""Short context sent along with every Tier 2 request."""

from datetime import datetime, timedelta
from pathlib import Path

from app.config import get_settings
from app.library import list_topics
from app.locales import en
from app.skills.catalog import list_skills
from app.vault.reader import read_text

ABOUT_ME_LIMIT = 4000
INDEX_LIMIT = 3000


def _trim(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "\n…(truncated)"


def build_context(vault: Path, now: datetime) -> str:
    parts = [f"Now: {en.date_long(now.date())}, {now:%Y}, {now:%H:%M} ({get_settings().timezone})."]
    # Short calendar: the model gets weekday ↔ date wrong when it has to work it out by itself.
    days = [now.date() + timedelta(days=i) for i in range(15)]
    parts.append("Next days: " + "; ".join(f"{en.WEEKDAY_NAMES[d.weekday()][:3]} {d.isoformat()}" for d in days) + ".")

    about_me = []
    folder = vault / "wiki" / "about-me"
    if folder.is_dir():
        for path in sorted(folder.glob("*.md")):
            about_me.append(f"### {path.stem}\n{read_text(path).strip()}")
    if about_me:
        parts.append("## About the user\n" + _trim("\n\n".join(about_me), ABOUT_ME_LIMIT))

    index = read_text(vault / "wiki" / "_master-index.md")
    if index:
        parts.append("## Wiki index (_master-index.md)\n" + _trim(index, INDEX_LIMIT))

    topics = list_topics(vault)
    if topics:
        lines = [f"- `{x['slug']}`: {x['title']} ({x['kind']}, updated {x['updated'] or '?'})" for x in topics[:30]]
        parts.append("## Library (research and plans already saved)\n" + "\n".join(lines))

    skills = list_skills(vault)
    if skills:
        lines = [f"- {s.name}: {s.description}" for s in skills]
        parts.append("## Skills available in Claude Code\n" + "\n".join(lines))
    else:
        parts.append("## Skills available in Claude Code\n(none)")

    return "\n\n".join(parts)
