"""Short context sent along with every Tier 2 request.

`build_context` is what changes rarely (who the user is, the indexes, the skills) and goes first in the request;
`time_context` (now and the next days) changes on every call and goes last, so Claude Code's prompt cache can
reuse everything before it, the conversation included."""

from datetime import datetime, timedelta
from pathlib import Path

from app.config import get_settings
from app import modules
from app.library import list_topics
from app.locales import en
from app.skills.catalog import list_skills
from app.memory import recent
from app.memory.learn import facts as learned_facts
from app.memory.reader import read_text

ABOUT_ME_LIMIT = 4000
LEARNED_LIMIT = 2500
INDEX_LIMIT = 3000


def _trim(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "\n…(truncated)"


def time_context(now: datetime) -> str:
    parts = [f"Now: {en.date_long(now.date())}, {now:%Y}, {now:%H:%M} ({get_settings().timezone})."]
    # Short calendar: the model gets weekday ↔ date wrong when it has to work it out by itself.
    days = [now.date() + timedelta(days=i) for i in range(15)]
    parts.append("Next days: " + "; ".join(f"{en.WEEKDAY_NAMES[d.weekday()][:3]} {d.isoformat()}" for d in days) + ".")
    return "\n".join(parts)


def build_context(memory: Path, now: datetime) -> str:
    parts = []
    about_me = []
    folder = memory / "wiki" / "about-me"
    if folder.is_dir():
        # profile first; learned.md last, trimmed from the oldest so the newest facts are never cut
        notes = sorted(folder.glob("*.md"), key=lambda p: (p.stem != "profile", p.stem))
        for path in notes:
            if path.stem != "learned":
                about_me.append(f"### {path.stem}\n{read_text(path).strip()}")
    if about_me:
        parts.append("## About the user\n" + _trim("\n\n".join(about_me), ABOUT_ME_LIMIT))
    facts = learned_facts(memory)
    if facts:
        kept: list[str] = []
        size = 0
        for fact in reversed(facts):
            size += len(fact) + 3
            if size > LEARNED_LIMIT:
                break
            kept.append(f"- {fact}")
        older = "(older facts omitted)\n" if len(kept) < len(facts) else ""
        parts.append("## Learned from conversations (newest last; newer wins)\n" + older + "\n".join(reversed(kept)))
    if short := recent.context(memory, now.date()):
        parts.append(short)

    index = read_text(memory / "wiki" / "_master-index.md")
    if index:
        parts.append("## Wiki index (_master-index.md)\n" + _trim(index, INDEX_LIMIT))

    topics = list_topics(memory)
    if topics:
        lines = [f"- `{x['slug']}`: {x['title']} ({x['kind']}, updated {x['updated'] or '?'})" for x in topics[:30]]
        parts.append("## Library (research and plans already saved)\n" + "\n".join(lines))

    parts.append(modules.context(memory))

    skills = list_skills()
    if skills:
        lines = [f"- {s.name}: {s.description}" for s in skills]
        parts.append("## Skills available\n" + "\n".join(lines))
    else:
        parts.append("## Skills available\n(none)")

    return "\n\n".join(parts)
