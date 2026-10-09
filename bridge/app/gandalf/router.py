"""Gandalf's router: picks the tier for each request and writes the receipt.

Tier 1 (rules, no AI) → Tier 2 (fast Claude Code, decides to answer or escalate)
→ Tier 3 (background Claude Code session). One receipt per request: Tier 3 writes its own
when it finishes, adding the tokens of the Tier 2 call that escalated it.

Each request is a turn of a conversation (app.conversations): Tier 2 gets the conversation so far, a Tier 3
session gets it along with its task, and the turn is recorded when the reply is ready.
"""

import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path

import frontmatter

from app import clock, conversations, library
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
    conversation_id: str | None = None
    # After a pause: {"decision": "new" | "continue", "other_id": <the conversation left behind / continued>}.
    # The HUD offers to undo it (merge back, or split from this turn).
    thread: dict | None = None
    turn_id: str | None = None  # the turn in the conversation (to split from it)


def ai_calls_today(memory: Path, day: date) -> int:
    """Today's receipts with tier 2 or 3 (for the daily limit). Conversation summaries don't count."""
    folder = memory / RECEIPTS / f"{day:%Y}" / f"{day:%m}"
    total = 0
    for path in folder.glob(f"{day.isoformat()}-*.md"):
        try:
            meta = frontmatter.load(path).metadata
            if int(meta.get("tier") or 0) >= 2 and meta.get("intent") != conversations.SUMMARY_INTENT:
                total += 1
        except Exception:
            continue
    return total


def _resumable(manager: tier3.Manager, c: conversations.Conversation) -> str | None:
    """The Tier 3 session of the conversation's last AI turn, when a new escalation can pick it up (`--resume`):
    it wrote to the memory, finished well and is still known to the Bridge."""
    last = next((x for x in reversed(c.turns) if x.tier >= 2), None)
    if not last or last.tier != 3 or not last.session_id:
        return None
    s = manager.get(last.session_id)
    return s.id if s and s.status == "ok" and s.output == "memory" and s.claude_session_id else None


def ask(
    memory: Path,
    text: str,
    source: str = "hud",
    force_tier: int | None = None,
    confirm: bool = False,
    note: tuple[str, str] | None = None,
    conversation_id: str | None = None,
    deep: bool | None = None,
) -> GandalfReply:
    """`conversation_id`: the chat this request belongs to (None starts one; routines keep none).
    `deep`: the conversation uses the smarter Tier 2 model (GANDALF_TIER2_DEEP_MODEL) from now on."""
    start = time.perf_counter()
    now = clock.now()

    def ms() -> int:
        return round((time.perf_counter() - start) * 1000)

    c = (conversations.load(memory, conversation_id) if conversation_id else None) or conversations.new(now)
    if deep is not None:
        c.deep = deep
    turn = conversations.Turn(id=uuid.uuid4().hex[:8], at=now.isoformat(timespec="seconds"), question=text, source=source)
    thread: dict | None = None
    title: str | None = None

    def finish(r: GandalfReply) -> GandalfReply:
        """Records the turn in the conversation and schedules its summary."""
        if source == "routine":
            return r
        turn.answer, turn.tier, turn.intent = r.reply, r.tier, r.intent
        turn.receipt_id, turn.session_id = r.id, r.session_id
        r.conversation_id, r.thread, r.turn_id = c.id, thread, turn.id
        turn.reply = asdict(r)
        conversations.append(memory, c, turn, now, title=title, deep=c.deep)
        conversations.compact_in_background(memory, c.id)
        return r

    # ---------- Tier 1 ----------
    # A question about a note goes straight to the AI, and so does a reply that only makes sense in the conversation.
    if force_tier in (None, 1) and not note and not conversations.depends_on_context(c, text, now):
        ctx = tier1.Context(memory=memory, now=now, tz=clock.tz(), source=source)
        r = tier1.answer(text, ctx)
        if r or force_tier == 1:
            reply = r.text if r else t("router.not_understood")
            duration = ms()
            rid, _ = write_receipt(
                memory,
                Receipt(text, reply, source, 1, now, duration, intent=r.intent if r else "not_understood"),
            )
            return finish(GandalfReply(rid, 1, r.intent if r else None, r is not None, reply, duration, r.data if r else {}))

    # ---------- daily AI limit ----------
    settings = get_settings()
    limit = settings.daily_call_limit
    if not confirm and limit > 0:
        used = ai_calls_today(memory, now.date())
        if used >= limit:
            # Not a turn: the HUD sends the same question again with confirm.
            return GandalfReply(
                None, 0, None, False,
                t("router.limit", used=used, limit=limit),
                ms(), {"used": used, "limit": limit}, needs_confirmation=True,
                conversation_id=conversation_id,
            )

    manager = tier3.manager(memory)

    # ---------- straight to Tier 3 ----------
    if force_tier == 3:
        s = manager.create(text + conversations.task_context(c), request=text, source=source,
                           resumed_from=_resumable(manager, c), conversation=(c.id, turn.id))
        return finish(GandalfReply(None, 3, "claude_code", True, t("router.tier3"), ms(), session_id=s.id))

    # ---------- Tier 2 ----------
    paused_at = conversations.pause_start(c, now)
    d = tier2.decide(memory, text, now, conversations.context(c, now), note,
                     model=settings.tier2_deep_model if c.deep else None)
    title = d.title
    if paused_at is not None and d.thread == "new":
        left = c.id
        c = conversations.split(memory, c, paused_at, now)  # the turns since the pause go with the new subject
        thread = {"decision": "new", "other_id": left}
    elif paused_at is not None:
        thread = {"decision": "continue", "other_id": c.id}
    # Learning is a side effect of any action: it goes before so the reply can say what was kept.
    learned = learn.save(memory, d.learn, now, source, text) if d.learn and settings.auto_learn else []
    learned_text = learn.describe(learned)
    learned_data = {"learned": [x.__dict__ for x in learned]} if learned else {}

    if d.action == "escalate":
        s = manager.create(
            d.task + (f"\n\n(The question is about the note `{note[0]}`.)" if note else "") + conversations.task_context(c),
            request=text,
            source=source,
            skill=d.skill,
            previous_tokens=(d.input_tokens, d.output_tokens, d.cost_usd),
            resumed_from=_resumable(manager, c) if thread is None else None,
            conversation=(c.id, turn.id),
        )
        reason = (d.reason or t("router.escalated")) + learned_text
        return finish(GandalfReply(
            None, 3, f"skill:{d.skill}" if d.skill else "claude_code", True, reason, ms(),
            {"task": d.task, "skill": d.skill, **learned_data}, session_id=s.id,
        ))

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
            conversation=(c.id, turn.id),
        )
        return finish(GandalfReply(
            None, 3, "research", True, t("router.research", topic=p["topic"]) + learned_text, ms(),
            {"research": {**p}, **learned_data}, session_id=s.id,
        ))

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
        return finish(GandalfReply(rid, 2, "capture", True, reply, duration, data))

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
    return finish(GandalfReply(rid, 2, "answer", True, reply, duration, data))
