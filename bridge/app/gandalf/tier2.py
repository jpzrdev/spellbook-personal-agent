"""Gandalf's Tier 2: a fast model (through Claude Code, no tools) decides to answer or escalate."""

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from app import locales, persona
from app.config import get_settings
from app.gandalf import claude_cli
from app.gandalf.context import build_context, time_context
from app.locales import t

PROMPTS = Path(__file__).parent / "prompts"
# Personality (editable) + Tier 2 decision rules. Stable text helps Claude Code's cache.
PROMPT_FILES = ("personality.md", "manual.md", "tier2.md")

ITEM = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["reminder", "event", "task", "note"]},
        "text": {"type": "string"},
        "when": {"type": "string"},
        "time": {"type": "string"},
        "weekdays": {"type": "array", "items": {"type": "integer"}},
        "due": {"type": "string"},
        "priority": {"type": "string"},
        "title": {"type": "string"},
        "date": {"type": "string"},
        "all_day": {"type": "boolean"},
        "start_time": {"type": "string"},
        "end_time": {"type": "string"},
        "repeat": {"type": ["string", "null"]},
        "reminders_min": {"type": "array", "items": {"type": "integer"}},
        "location": {"type": "string"},
    },
    "required": ["type"],
}

LEARN_ITEM = {
    "type": "object",
    "properties": {
        "fact": {"type": "string"},
        "where": {"type": "string", "enum": ["profile", "raw", "recent"]},
        "replaces": {"type": ["string", "null"]},
        "days": {"type": "integer"},
    },
    "required": ["fact", "where"],
}

SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["answer", "escalate", "capture", "research"]},
        "reply": {"type": "string"},
        "reason": {"type": "string"},
        "task": {"type": "string"},
        "skill": {"type": ["string", "null"]},
        "items": {"type": "array", "items": ITEM},
        "topic": {"type": "string"},
        "query": {"type": "string"},
        "kind": {"type": "string", "enum": ["research", "plan"]},
        "update": {"type": ["string", "null"]},
        "learn": {"type": "array", "items": LEARN_ITEM},
        "thread": {"type": "string", "enum": ["continue", "new"]},
        "title": {"type": "string"},
    },
    "required": ["action"],
}


@dataclass
class Decision:
    action: str  # answer | escalate | capture | research
    reply: str = ""
    reason: str = ""
    task: str = ""
    skill: str | None = None
    items: list[dict] = field(default_factory=list)
    research: dict | None = None  # {topic, query, kind, update}
    learn: list[dict] = field(default_factory=list)  # facts to keep, alongside any action (app.memory.learn)
    thread: str | None = None  # after a pause: "continue" the conversation or start a "new" one
    title: str | None = None  # the conversation's title, when it has none yet
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    attempts: int = 1
    warnings: list[str] = field(default_factory=list)


def extract_json(text: str) -> dict | None:
    """Accepts plain JSON or JSON inside a ```json``` block."""
    text = text.strip()
    if m := re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S):
        text = m.group(1)
    elif not text.startswith("{") and (m := re.search(r"\{.*\}", text, re.S)):
        text = m.group(0)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _valid(data: dict | None) -> bool:
    if not data:
        return False
    if data.get("action") == "answer":
        return bool(str(data.get("reply") or "").strip())
    if data.get("action") == "escalate":
        return bool(str(data.get("task") or "").strip())
    if data.get("action") == "research":
        return bool(str(data.get("query") or "").strip())
    if data.get("action") == "capture":
        items = data.get("items")
        return isinstance(items, list) and bool(items) and all(isinstance(i, dict) and i.get("type") for i in items)
    return False


def language_instruction() -> str:
    name = locales.current().NAME
    return (
        "## Language\n\n"
        f"The user speaks {name}. Write everything the user will read in {name}: `reply`, `reason`, "
        "item texts and titles, the research `topic` and the `learn` facts. Keep the JSON keys and enum values exactly as specified."
    )


def system_prompt() -> str:
    parts = [(PROMPTS / a).read_text(encoding="utf-8").strip() for a in PROMPT_FILES]
    return persona.render("\n\n".join([*parts, language_instruction()]))


def _args(model: str | None = None) -> list[str]:
    return [
        "--model", model or get_settings().tier2_model,
        "--tools", "",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--system-prompt", system_prompt(),
        "--json-schema", json.dumps(SCHEMA, ensure_ascii=False),
    ]


def decide(memory: Path, request: str, now: datetime, conversation: str | None = None,
           note: tuple[str, str] | None = None, model: str | None = None) -> Decision:
    """`conversation`: the `<conversation>` block (app.conversations.context), so follow-ups like "tomorrow at 9"
    after Gandalf asked "when?" make sense. `model` overrides GANDALF_TIER2_MODEL (a "deep" conversation).

    Order matters for Claude Code's prompt cache: what changes least goes first, the time and the request last."""
    prompt = f"<context>\n{build_context(memory, now)}\n</context>\n\n"
    if conversation:
        prompt += conversation + "\n\n"
    if note:
        path, text = note
        prompt += f'<note_being_studied path="{path}">\n{text[:8000]}\n</note_being_studied>\n\n'
    prompt += f"<now>\n{time_context(now)}\n</now>\n\n<request>\n{request.strip()}\n</request>"

    total_in = total_out = 0
    cost = 0.0
    last = None
    for attempt in (1, 2):  # invalid JSON: try once more
        r = claude_cli.run_json(prompt, _args(model), cwd=memory)
        total_in += r.input_tokens
        total_out += r.output_tokens
        cost += r.cost_usd
        last = r
        data = r.structured if _valid(r.structured) else extract_json(r.text)
        if _valid(data):
            skill = data.get("skill")
            return Decision(
                action=data["action"],
                reply=str(data.get("reply") or "").strip(),
                reason=str(data.get("reason") or "").strip(),
                task=str(data.get("task") or "").strip(),
                skill=skill if isinstance(skill, str) and skill.strip() and skill != "null" else None,
                items=(data.get("items") or []) if data["action"] == "capture" else [],
                research={
                    "topic": str(data.get("topic") or "").strip()[:80] or "Research",
                    "query": str(data.get("query")).strip(),
                    "kind": "plan" if data.get("kind") == "plan" else "research",
                    "update": (str(data["update"]).strip() or None) if data.get("update") else None,
                } if data["action"] == "research" else None,
                learn=[x for x in data.get("learn") or [] if isinstance(x, dict)],
                thread=data.get("thread") if data.get("thread") in ("continue", "new") else None,
                title=str(data.get("title") or "").strip()[:80] or None,
                model=r.model,
                input_tokens=total_in,
                output_tokens=total_out,
                cost_usd=cost,
                attempts=attempt,
            )

    # After 2 attempts, treat the raw text as the answer.
    assert last is not None
    return Decision(
        action="answer",
        reply=last.text.strip() or t("tier2.no_answer"),
        model=last.model,
        input_tokens=total_in,
        output_tokens=total_out,
        cost_usd=cost,
        attempts=2,
        warnings=["invalid JSON from Tier 2; used the raw answer"],
    )
