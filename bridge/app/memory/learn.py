"""Automatic learning: what the user reveals in passing becomes memory, without them asking.

Tier 2 returns, along with any action, a `learn` list ({fact, where, replaces}). The decision about
WHAT is worth keeping is the model's (rules in `prompts/tier2.md`); here the Bridge decides HOW to
store it, with guards the model can't skip:

| where | Goes to | When |
|---|---|---|
| profile | `wiki/about-me/learned.md` (one line, dated) | a short, durable fact about the user. Tier 2 reads it on the next request. |
| raw | `raw/` (`type: learned`) | knowledge that needs organizing into a topic: compile-raw folds it into the wiki. |

`replaces` removes the older line a correction makes stale ("I don't work at X anymore"). Duplicates
and anything that looks like a secret are dropped. lint-wiki consolidates learned.md into the other notes.
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.locales import t
from app.memory import writer
from app.memory.reader import read_text

LEARNED = "wiki/about-me/learned.md"
LOG = "wiki/_log.md"
MASTER_INDEX = "wiki/_master-index.md"
MAX_ITEMS = 3
MAX_FACT = 300
# Facts never stored, whatever the model says: passwords/tokens and long numbers (documents, cards, accounts, phones).
SECRET_RE = re.compile(
    r"\b(password|passwd|senha|token|api[ _-]?key|pin|cvv|ssn|cpf|rg|passport|passaporte)\b|\b\d(?:[ .\-/]?\d){8,}\b",  # 9+ digits: a date (8) still passes
    re.I,
)
LINE_RE = re.compile(r"^- (?P<fact>.+?)(?: \((?P<date>\d{4}-\d{2}-\d{2})\))?\s*$")


@dataclass
class Learned:
    fact: str
    where: str  # profile | raw
    path: str
    replaced: str | None = None


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def facts(memory: Path) -> list[str]:
    """The facts in learned.md, oldest first."""
    out = []
    for line in read_text(memory / LEARNED).splitlines():
        if m := LINE_RE.match(line.strip()):
            out.append(m.group("fact"))
    return out


def _new_learned_file(now: datetime) -> str:
    return (
        "---\n"
        "type: profile\n"
        "tags: [about-me]\n"
        f"created: {now:%Y-%m-%d}\n"
        "sources: []\n"
        "---\n"
        f"{t('file.learned_header')}\n"
    )


def _index_learned(memory: Path) -> None:
    """A memory created before learned.md existed: list it in the master index (otherwise it's an orphan)."""
    path = memory / MASTER_INDEX
    text = read_text(path)
    if not text or "[[wiki/about-me/learned" in text:
        return
    writer.write_atomic(path, text.rstrip("\n") + "\n" + t("file.learned_index_line") + "\n")


def _append_log(memory: Path, now: datetime, text: str) -> None:
    path = memory / LOG
    current = read_text(path)
    if not current:
        return  # no log in this memory: nothing to append to
    writer.write_atomic(path, current.rstrip("\n") + f"\n- {now:%Y-%m-%d %H:%M} · learn · {text}\n")


def _add_profile(memory: Path, fact: str, replaces: str | None, now: datetime) -> tuple[bool, str | None]:
    """Appends to learned.md. Returns (written, replaced line). A duplicate isn't written."""
    path = memory / LEARNED
    content = read_text(path) or _new_learned_file(now)
    lines = content.rstrip("\n").split("\n")
    key = _norm(fact)
    replaced = None
    kept = []
    for line in lines:
        m = LINE_RE.match(line.strip())
        old = m.group("fact") if m else None
        if old and replaces and replaced is None and _norm(replaces) and _norm(replaces) in _norm(old):
            replaced = old
            continue
        if old and _norm(old) == key:
            return False, None
        kept.append(line)
    kept.append(f"- {fact} ({now:%Y-%m-%d})")
    writer.write_atomic(path, "\n".join(kept) + "\n")
    return True, replaced


def save(memory: Path, items: list[dict], now: datetime, source: str, request: str) -> list[Learned]:
    """Stores what Tier 2 decided to learn. Invalid items are skipped silently (learning is a side effect)."""
    out: list[Learned] = []
    created_file = not (memory / LEARNED).exists()
    for item in items[:MAX_ITEMS]:
        if not isinstance(item, dict):
            continue
        fact = re.sub(r"\s+", " ", str(item.get("fact") or "")).strip()
        if not fact or len(fact) > MAX_FACT or SECRET_RE.search(fact):
            continue
        where = "raw" if item.get("where") == "raw" else "profile"
        if where == "profile":
            replaces = str(item.get("replaces") or "").strip() or None
            written, replaced = _add_profile(memory, fact, replaces, now)
            if written:
                out.append(Learned(fact, "profile", LEARNED, replaced))
        else:
            if any(_norm(fact) == _norm(x) for x in facts(memory)):
                continue
            body = f"{fact}\n\n> {request.strip()[:500]}" if request.strip() else fact
            path = writer.save_raw(memory, body, now, source, title=fact[:60], kind="learned")
            out.append(Learned(fact, "raw", path.relative_to(memory).as_posix()))
    if any(x.where == "profile" for x in out):
        if created_file:
            _index_learned(memory)
        profile = [x for x in out if x.where == "profile"]
        _append_log(memory, now, f"[[{LEARNED.removesuffix('.md')}]]: " + "; ".join(
            x.fact + (f" (replaces: {x.replaced})" if x.replaced else "") for x in profile
        ))
    return out


def describe(learned: list[Learned]) -> str:
    """The line appended to Gandalf's reply, so the user sees (and can fix) what was kept."""
    if not learned:
        return ""
    parts = [t("learn.profile" if x.where == "profile" else "learn.raw", fact=x.fact, path=x.path) for x in learned]
    return "\n\n" + "\n".join(parts)
