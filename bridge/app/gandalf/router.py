"""Gandalf's router: picks the tier for each request and writes the receipt.

Tier 1 (rules, no AI) → Tier 2 (fast Claude Code, decides to answer or escalate)
→ Tier 3 (background Claude Code session). One receipt per request: Tier 3 writes its own
when it finishes, adding the tokens of the Tier 2 call that escalated it.
"""

import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import frontmatter

from app import clock, library
from app.config import get_settings
from app.gandalf import tier1, tier2, tier3, triage
from app.locales import t
from app.memory import learn
from app.receipts import RECEIPTS, Receipt, write_receipt

UPDATE_CONTEXT = (
    "\n\nThe user already has saved material about this (below). Research what is missing or has changed "
    "and deliver only what is new or corrected, saying what changed.\n\n<already_saved>\n{saved}\n</already_saved>"
)


@dataclass
class GandalfReply:
    id: str | None
    tier: int
    intent: str | None
    understood: bool
    reply: str
    duration_ms: int
    data: dict = field(default_factory=dict)
    session_id: str | None = None
    needs_confirmation: bool = False


def ai_calls_today(memory: Path, day: date) -> int:
    """Today's receipts with tier 2 or 3 (for the daily limit)."""
    folder = memory / RECEIPTS / f"{day:%Y}" / f"{day:%m}"
    total = 0
    for path in folder.glob(f"{day.isoformat()}-*.md"):
        try:
            if int(frontmatter.load(path).get("tier") or 0) >= 2:
                total += 1
        except Exception:
            continue
    return total


def ask(
    memory: Path,
    text: str,
    source: str = "hud",
    force_tier: int | None = None,
    confirm: bool = False,
    previous: list[dict] | None = None,
    note: tuple[str, str] | None = None,
) -> GandalfReply:
    start = time.perf_counter()
    now = clock.now()

    def ms() -> int:
        return round((time.perf_counter() - start) * 1000)

    # ---------- Tier 1 ----------
    if force_tier in (None, 1) and not note:  # a question about a note goes straight to the AI
        ctx = tier1.Context(memory=memory, now=now, tz=clock.tz(), source=source)
        r = tier1.answer(text, ctx)
        if r or force_tier == 1:
            reply = r.text if r else t("router.not_understood")
            duration = ms()
            rid, _ = write_receipt(
                memory,
                Receipt(text, reply, source, 1, now, duration, intent=r.intent if r else "not_understood"),
            )
            return GandalfReply(rid, 1, r.intent if r else None, r is not None, reply, duration, r.data if r else {})

    # ---------- daily AI limit ----------
    limit = get_settings().daily_call_limit
    if not confirm and limit > 0:
        used = ai_calls_today(memory, now.date())
        if used >= limit:
            return GandalfReply(
                None, 0, None, False,
                t("router.limit", used=used, limit=limit),
                ms(), {"used": used, "limit": limit}, needs_confirmation=True,
            )

    manager = tier3.manager(memory)

    # ---------- straight to Tier 3 ----------
    if force_tier == 3:
        s = manager.create(text, source=source)
        return GandalfReply(None, 3, "claude_code", True, t("router.tier3"), ms(), session_id=s.id)

    # ---------- Tier 2 ----------
    d = tier2.decide(memory, text, now, previous, note)
    # Learning is a side effect of any action: it goes before so the reply can say what was kept.
    learned = learn.save(memory, d.learn, now, source, text) if d.learn and get_settings().auto_learn else []
    learned_text = learn.describe(learned)
    learned_data = {"learned": [x.__dict__ for x in learned]} if learned else {}

    if d.action == "escalate":
        s = manager.create(
            d.task + (f"\n\n(The question is about the note `{note[0]}`.)" if note else ""),
            request=text,
            source=source,
            skill=d.skill,
            previous_tokens=(d.input_tokens, d.output_tokens, d.cost_usd),
        )
        reason = (d.reason or t("router.escalated")) + learned_text
        return GandalfReply(
            None, 3, f"skill:{d.skill}" if d.skill else "claude_code", True, reason, ms(),
            {"task": d.task, "skill": d.skill, **learned_data}, session_id=s.id,
        )

    if d.action == "research":
        p = d.research or {}
        task = p["query"]
        if p.get("update"):
            try:
                task += UPDATE_CONTEXT.format(saved=library.context_for_update(memory, p["update"]))
            except (FileNotFoundError, library.InvalidTopic):
                p["update"] = None
        s = manager.create(
            task,
            request=text,
            source=source,
            skill="research",
            output="research",
            research={"topic": p["topic"], "kind": p["kind"], "request": text, "slug": p.get("update")},
            previous_tokens=(d.input_tokens, d.output_tokens, d.cost_usd),
        )
        return GandalfReply(
            None, 3, "research", True, t("router.research", topic=p["topic"]) + learned_text, ms(),
            {"research": {**p}, **learned_data}, session_id=s.id,
        )

    if d.action == "capture":
        reply, data = triage.execute(memory, clock.tz(), d.items, now, text, source)
        reply += learned_text
        data |= learned_data
        duration = ms()
        rid, _ = write_receipt(
            memory,
            Receipt(
                text, reply, source, 2, now, duration,
                intent="capture", model=d.model,
                input_tokens=d.input_tokens, output_tokens=d.output_tokens,
                estimated_cost_usd=round(d.cost_usd, 6),
            ),
        )
        return GandalfReply(rid, 2, "capture", True, reply, duration, data)

    reply = d.reply + learned_text
    duration = ms()
    rid, _ = write_receipt(
        memory,
        Receipt(
            text, reply, source, 2, now, duration,
            intent="answer", model=d.model,
            input_tokens=d.input_tokens, output_tokens=d.output_tokens,
            estimated_cost_usd=round(d.cost_usd, 6),
        ),
    )
    data = ({"warnings": d.warnings} if d.warnings else {}) | learned_data
    return GandalfReply(rid, 2, "answer", True, reply, duration, data)
