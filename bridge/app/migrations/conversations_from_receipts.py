"""Rebuilds the chats from before conversations existed, from the receipts.

Receipts keep every request and answer but not which conversation they belonged to: requests from the HUD and
the voice are grouped by time (a gap of more than `conversations.PAUSE` starts another conversation). Routines
and conversation summaries are left out, and so is any receipt already in a conversation (running it twice
imports nothing new). Imported conversations have no summary: one is made when you continue them.

Usage: uv run python -m app.migrations.conversations_from_receipts [--apply] [--memory PATH]
"""

import argparse
import re
from datetime import datetime
from pathlib import Path

import frontmatter

from app import conversations
from app.config import get_settings
from app.receipts import RECEIPTS

SECTIONS_RE = re.compile(r"## Request\s*\n(?P<request>.*?)\n## Response\s*\n(?P<response>.*)", re.S)


def _receipts(memory: Path) -> list[dict]:
    out = []
    for path in sorted((memory / RECEIPTS).rglob("*.md")):
        if path.name.startswith(".tmp-"):
            continue
        try:
            post = frontmatter.load(path)
        except Exception:
            continue
        meta = post.metadata
        if meta.get("source") not in ("hud", "voice") or meta.get("routine") or meta.get("intent") == conversations.SUMMARY_INTENT:
            continue
        m = SECTIONS_RE.search(post.content)
        at = meta.get("at")
        if not m or not meta.get("id") or not at:
            continue
        out.append({
            "id": str(meta["id"]),
            "at": at if isinstance(at, datetime) else datetime.fromisoformat(str(at)),
            "tier": int(meta.get("tier") or 0),
            "intent": meta.get("intent"),
            "source": meta.get("source"),
            "duration_ms": int(meta.get("duration_ms") or 0),
            "request": m.group("request").strip(),
            "response": m.group("response").strip(),
        })
    return sorted(out, key=lambda r: r["at"])


def _known(memory: Path) -> set[str]:
    known = set()
    for item in conversations.list_items(memory, limit=100_000):
        c = conversations.load(memory, item["id"])
        known |= {t.receipt_id for t in c.turns if t.receipt_id} if c else set()
    return known


def group(receipts: list[dict]) -> list[list[dict]]:
    groups: list[list[dict]] = []
    for r in receipts:
        if groups and r["at"] - groups[-1][-1]["at"] < conversations.PAUSE:
            groups[-1].append(r)
        else:
            groups.append([r])
    return groups


def migrate(memory: Path, apply: bool) -> int:
    known = _known(memory)
    groups = group([r for r in _receipts(memory) if r["id"] not in known])
    for g in groups:
        c = conversations.new(g[0]["at"])
        for r in g:
            reply = {"id": r["id"], "tier": r["tier"], "intent": r["intent"], "understood": True, "reply": r["response"],
                     "duration_ms": r["duration_ms"], "data": {}, "session_id": None, "needs_confirmation": False,
                     "conversation_id": c.id, "thread": None}
            c.turns.append(conversations.Turn(
                id=r["id"][-8:].lower(), at=r["at"].isoformat(timespec="seconds"), question=r["request"],
                answer=r["response"][:conversations.STORED_ANSWER_LIMIT], tier=r["tier"], intent=r["intent"],
                source=r["source"], receipt_id=r["id"], reply=reply,
            ))
        c.title = g[0]["request"][:conversations.TITLE_LIMIT]
        c.updated = g[-1]["at"].isoformat(timespec="seconds")
        print(f"{'+' if apply else '·'} {g[0]['at']:%Y-%m-%d %H:%M} · {len(g)} turn(s) · {c.title}")
        if apply:
            conversations.save(memory, c)
    return len(groups)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the conversations (without it, only lists them)")
    parser.add_argument("--memory", type=Path, default=None)
    args = parser.parse_args()
    memory = args.memory or get_settings().memory_path
    n = migrate(memory, args.apply)
    if not n:
        print("Nothing to import.")
    elif not args.apply:
        print(f"\n{n} conversation(s) to import. Run again with --apply to write them.")
    else:
        print(f"\n{n} conversation(s) imported into {memory / conversations.CONVERSATIONS}.")


if __name__ == "__main__":
    main()
