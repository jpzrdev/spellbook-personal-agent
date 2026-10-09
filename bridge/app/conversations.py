"""Conversations with Gandalf: the chat's history, kept by the Bridge so every request carries what came before.

One JSON file per conversation in `memory/conversations/<id>.json` (shared by the PC, the phone and the voice).
What goes to the model is built here, within a budget:

- The recent turns go whole (long answers trimmed, with a pointer to the receipt).
- When the turns not yet summarized pass `COMPACT_AT` tokens, the oldest ones are folded into the conversation's
  summary by the fast model, in the background, down to `COMPACT_TO`. The summary is incremental (old summary +
  the turns leaving), structured (topic, facts and decisions, preferences, open questions, notes cited) and
  doubles as the conversation's title and preview in the HUD.
- After a pause (`PAUSE`), the next request carries only the summary and the last turns, and Tier 2 says whether
  it continues the conversation or starts another one (`thread`); the HUD can undo either choice.

Ephemeral results (email summaries, web research) never go into these files: a turn keeps the ephemeral's id
and its text is read from the ephemeral store while it exists.
"""

import json
import logging
import re
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from app import clock, ephemeral, persona
from app.config import get_settings
from app.memory import writer

log = logging.getLogger("gandalf.conversations")

CONVERSATIONS = "conversations"
PROMPT = Path(__file__).parent / "gandalf" / "prompts" / "summary.md"
PAUSE = timedelta(minutes=30)
CHARS_PER_TOKEN = 4
COMPACT_AT = 6000 * CHARS_PER_TOKEN  # unsummarized turns (in characters) that trigger a summary
COMPACT_TO = 3000 * CHARS_PER_TOKEN  # what stays whole after it
KEEP_WHOLE = 4  # the last turns are never summarized
QUESTION_LIMIT = 2000
ANSWER_LIMIT = 1500
PAUSED_TURNS = 3  # after a pause: the summary and only these last turns, shorter
PAUSED_ANSWER_LIMIT = 500
TASK_LIMIT = 8000  # conversation sent along with a Tier 3 task (characters)
STORED_ANSWER_LIMIT = 20_000
SUMMARY_LIMIT = 4000
TITLE_LIMIT = 80
ID_RE = re.compile(r"^[0-9]{8}-[0-9]{4}-[0-9a-f]{6}$")

SCHEMA = {
    "type": "object",
    "properties": {"title": {"type": "string"}, "summary": {"type": "string"}},
    "required": ["title", "summary"],
}

_lock = threading.RLock()
_compacting: set[str] = set()


@dataclass
class Turn:
    id: str
    at: str
    question: str
    answer: str = ""
    tier: int = 0
    intent: str | None = None
    source: str = "hud"
    receipt_id: str | None = None
    session_id: str | None = None
    ephemeral_id: str | None = None
    # Gandalf's reply as the HUD received it (badges, proposals, research): to show the conversation again.
    reply: dict | None = None


@dataclass
class Conversation:
    id: str
    created: str
    updated: str
    title: str = ""
    titled: bool = False  # the title came from the model (otherwise it is the first question)
    deep: bool = False  # Tier 2 uses the smarter model (GANDALF_TIER2_DEEP_MODEL)
    summary: str = ""
    summarized: int = 0  # how many turns (from the start) the summary covers
    split_from: str | None = None  # the conversation it was split from (after a pause), for "undo"
    turns: list[Turn] = field(default_factory=list)

    def preview(self) -> dict:
        last = self.turns[-1] if self.turns else None
        return {
            "id": self.id,
            "title": self.title or (self.turns[0].question[:TITLE_LIMIT] if self.turns else ""),
            "created": self.created,
            "updated": self.updated,
            "deep": self.deep,
            "turn_count": len(self.turns),
            "summary": self.summary,
            "last_question": last.question[:200] if last else "",
            "split_from": self.split_from,
        }

    def to_json(self) -> dict:
        return {**self.preview(), "summarized": self.summarized, "turns": [asdict(x) for x in self.turns]}


class InvalidId(ValueError):
    pass


# ---------- storage ----------

def _folder(memory: Path) -> Path:
    return memory / CONVERSATIONS


def _path(memory: Path, conversation_id: str) -> Path:
    if not ID_RE.match(conversation_id):
        raise InvalidId(conversation_id)
    return _folder(memory) / f"{conversation_id}.json"


def _from_json(data: dict) -> Conversation:
    turns = [Turn(**{k: v for k, v in t.items() if k in Turn.__dataclass_fields__}) for t in data.get("turns") or []]
    fields = {k: v for k, v in data.items() if k in Conversation.__dataclass_fields__ and k != "turns"}
    return Conversation(**fields, turns=turns)


def new(now: datetime, deep: bool = False, split_from: str | None = None) -> Conversation:
    """A conversation in memory only: it is written with its first turn."""
    stamp = now.isoformat(timespec="seconds")
    return Conversation(id=f"{now:%Y%m%d-%H%M}-{uuid.uuid4().hex[:6]}", created=stamp, updated=stamp,
                        deep=deep, split_from=split_from)


def load(memory: Path, conversation_id: str) -> Conversation | None:
    try:
        path = _path(memory, conversation_id)
    except InvalidId:
        return None
    with _lock:
        try:
            return _from_json(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError, TypeError):
            return None


def save(memory: Path, c: Conversation) -> None:
    with _lock:
        writer.write_atomic(_path(memory, c.id), json.dumps(asdict(c), ensure_ascii=False, indent=1))


def delete(memory: Path, conversation_id: str) -> bool:
    path = _path(memory, conversation_id)
    with _lock:
        existed = path.exists()
        path.unlink(missing_ok=True)
    return existed


def list_items(memory: Path, limit: int = 50, query: str = "") -> list[dict]:
    """Newest first (by last activity). `query` searches titles, summaries and the text of the turns."""
    folder = _folder(memory)
    if not folder.is_dir():
        return []
    paths = sorted(folder.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    words = [w for w in _plain(query).split() if w]
    out = []
    for path in paths:
        c = load(memory, path.stem)
        if not c or not c.turns:
            continue
        if words:
            text = _plain(" ".join([c.title, c.summary, *(f"{t.question} {t.answer}" for t in c.turns)]))
            if not all(w in text for w in words):
                continue
        out.append(c.preview())
        if len(out) >= limit:
            break
    return sorted(out, key=lambda x: x["updated"], reverse=True)


def _plain(text: str) -> str:
    from app.memory.learn import _norm

    return _norm(text)


# ---------- turns ----------

def append(memory: Path, c: Conversation, turn: Turn, now: datetime, *, title: str | None = None,
           deep: bool | None = None) -> Conversation:
    """Adds the turn to the conversation as it is on disk (a summary may have been written meanwhile)."""
    turn.question = turn.question.strip()
    turn.answer = turn.answer.strip()[:STORED_ANSWER_LIMIT]
    with _lock:
        fresh = load(memory, c.id) or c
        if deep is not None:
            fresh.deep = deep
        if title and not fresh.titled:
            fresh.title, fresh.titled = title[:TITLE_LIMIT], True
        if not fresh.title:
            fresh.title = turn.question[:TITLE_LIMIT]
        fresh.turns.append(turn)
        fresh.updated = now.isoformat(timespec="seconds")
        save(memory, fresh)
    return fresh


def update_turn(memory: Path, conversation_id: str, turn_id: str, **fields) -> None:
    with _lock:
        c = load(memory, conversation_id)
        if not c:
            return
        for t in c.turns:
            if t.id == turn_id:
                for k, v in fields.items():
                    setattr(t, k, v)
                save(memory, c)
                return


def complete(memory: Path, conversation_id: str, turn_id: str, *, answer: str | None = None,
             ephemeral_id: str | None = None) -> None:
    """A Tier 3 session finished: its result becomes the turn's answer (or the id of its ephemeral output)."""
    fields: dict = {}
    if answer and answer.strip():
        fields["answer"] = answer.strip()[:STORED_ANSWER_LIMIT]
    if ephemeral_id:
        fields["ephemeral_id"] = ephemeral_id
    if fields:
        update_turn(memory, conversation_id, turn_id, **fields)
    compact_in_background(memory, conversation_id)


def _at(turn: Turn) -> datetime:
    return datetime.fromisoformat(turn.at)


def pause_start(c: Conversation, now: datetime) -> int | None:
    """Index of the first turn after a pause, or None when the conversation isn't paused.

    The pause counts from the last turn that went to the AI: a quick "what do I have today?" (Tier 1) after a
    break doesn't hide the break from the next real question."""
    ai = [i for i, t in enumerate(c.turns) if t.tier >= 2]
    if not ai:
        return None
    last = ai[-1]
    if now - _at(c.turns[last]) < PAUSE:
        return None
    return last + 1


def depends_on_context(c: Conversation, text: str, now: datetime) -> bool:
    """A message that only makes sense with the conversation ("tomorrow at 9" after "when?", "and the second
    one?") skips Tier 1's rules, which don't see the conversation."""
    if not c.turns or now - _at(c.turns[-1]) >= PAUSE:
        return False
    from app import locales
    from app.gandalf.tier1 import normalize

    last = c.turns[-1]
    if last.tier >= 2 and last.answer.rstrip().endswith("?"):
        return True
    return bool(locales.current().FOLLOW_UP_RE.match(normalize(text)))


def _answer_text(t: Turn, limit: int) -> str:
    text = t.answer
    if t.ephemeral_id and (e := ephemeral.get(t.ephemeral_id)):
        text = e.text  # read from the ephemeral store, never written into the conversation
    text = text.strip() or "(no answer)"
    if len(text) > limit:
        cut = text[:limit].rstrip()
        text = cut + (f"… (cut; the full answer is in receipt {t.receipt_id})" if t.receipt_id else "… (cut)")
    return text


def _turn_text(t: Turn, name: str, answer_limit: int) -> str:
    question = t.question if len(t.question) <= QUESTION_LIMIT else t.question[:QUESTION_LIMIT] + "…"
    return f"User: {question}\n{name}: {_answer_text(t, answer_limit)}"


def context(c: Conversation, now: datetime) -> str:
    """The `<conversation>` block for Tier 2."""
    if not c.turns:
        return '<conversation untitled="true">\n(a new conversation: this request is its first message)\n</conversation>'
    name = persona.current().name
    start = pause_start(c, now)
    attrs = f'title="{_attr(c.title)}"' if c.titled else 'untitled="true"'
    if start is not None:
        minutes = int((now - _at(c.turns[start - 1])).total_seconds() // 60)
        attrs += f' paused_minutes="{minutes}"'
        turns = c.turns[max(c.summarized, len(c.turns) - PAUSED_TURNS):]
        limit = PAUSED_ANSWER_LIMIT
    else:
        turns = c.turns[c.summarized:]
        limit = ANSWER_LIMIT
    parts = []
    if c.summary:
        parts.append(f"<summary>\n{c.summary}\n</summary>")
    if turns:
        parts.append("\n\n".join(_turn_text(t, name, limit) for t in turns))
    return f"<conversation {attrs}>\n" + "\n\n".join(parts) + "\n</conversation>"


def task_context(c: Conversation) -> str:
    """The conversation so far, for a Tier 3 session (which doesn't see the chat): summary + the newest turns
    that fit in `TASK_LIMIT`."""
    if not c.turns:
        return ""
    name = persona.current().name
    picked: list[str] = []
    size = len(c.summary)
    for t in reversed(c.turns[c.summarized:]):
        text = _turn_text(t, name, ANSWER_LIMIT)
        if picked and size + len(text) > TASK_LIMIT:
            break
        picked.append(text)
        size += len(text)
    parts = ([f"Summary of the earlier part:\n{c.summary}"] if c.summary else []) + list(reversed(picked))
    return (
        "\n\n<conversation_so_far>\n(The chat with the user before this request, for context; "
        "the request above is what to do.)\n\n" + "\n\n".join(parts) + "\n</conversation_so_far>"
    )


def _attr(text: str) -> str:
    return text.replace('"', "'").replace("\n", " ")


# ---------- split (after a pause) ----------

def split(memory: Path, c: Conversation, start: int, now: datetime) -> Conversation:
    """Moves the turns from `start` on to a new conversation (Tier 2 said the subject changed, or the user
    asked to start a new one from a turn)."""
    with _lock:
        c = load(memory, c.id) or c
        moved = c.turns[start:]
        target = new(now, deep=c.deep, split_from=c.id)
        target.turns = moved
        target.title = moved[0].question[:TITLE_LIMIT] if moved else ""
        target.updated = now.isoformat(timespec="seconds")
        c.turns = c.turns[:start]
        c.summarized = min(c.summarized, len(c.turns))
        if c.turns:
            save(memory, c)
        else:
            delete(memory, c.id)
        if moved:
            save(memory, target)
    return target


def merge_back(memory: Path, c: Conversation) -> Conversation | None:
    """Undoes a split: the conversation's turns go back to the end of the one it came from."""
    if not c.split_from:
        return None
    with _lock:
        previous = load(memory, c.split_from)
        if not previous:
            return None
        previous.turns += c.turns
        previous.updated = max(previous.updated, c.updated)
        save(memory, previous)
        delete(memory, c.id)
    compact_in_background(memory, previous.id)
    return previous


# ---------- summary ----------

def _unsummarized_chars(c: Conversation) -> int:
    name = persona.current().name
    return sum(len(_turn_text(t, name, ANSWER_LIMIT)) for t in c.turns[c.summarized:])


def _leaving(c: Conversation) -> int:
    """How many turns (after the summarized ones) leave the window: enough to go down to COMPACT_TO,
    always keeping the last KEEP_WHOLE whole."""
    name = persona.current().name
    sizes = [len(_turn_text(t, name, ANSWER_LIMIT)) for t in c.turns[c.summarized:]]
    total = sum(sizes)
    n = 0
    while total > COMPACT_TO and len(sizes) - n > KEEP_WHOLE:
        total -= sizes[n]
        n += 1
    return n


def _summary_text(t: Turn, name: str) -> str:
    # Ephemeral outputs stay out of the memory, and the summary is written to it.
    answer = "(an ephemeral result shown only in the HUD)" if t.ephemeral_id else _answer_text(t, 3000)
    return f"[{t.at[:16]}] User: {t.question}\n{name}: {answer}"


def compact(memory: Path, conversation_id: str) -> bool:
    """Folds the oldest turns into the summary when the window is over budget. Returns whether it did."""
    from app.gandalf import claude_cli, tier2
    from app.receipts import Receipt, write_receipt

    c = load(memory, conversation_id)
    if not c or _unsummarized_chars(c) <= COMPACT_AT:
        return False
    n = _leaving(c)
    if n <= 0:
        return False
    name = persona.current().name
    leaving = c.turns[c.summarized:c.summarized + n]
    prompt = (
        f"<previous_summary>\n{c.summary or '(none yet)'}\n</previous_summary>\n\n"
        f"<turns_to_fold>\n" + "\n\n".join(_summary_text(t, name) for t in leaving) + "\n</turns_to_fold>"
    )
    system = persona.render(PROMPT.read_text(encoding="utf-8").strip()) + "\n\n" + tier2.language_instruction()
    args = ["--model", get_settings().tier2_model, "--tools", "", "--no-session-persistence", "--strict-mcp-config",
            "--disable-slash-commands", "--system-prompt", system, "--json-schema", json.dumps(SCHEMA)]
    now = clock.now()
    r = claude_cli.run_json(prompt, args, cwd=memory)
    data = r.structured or tier2.extract_json(r.text) or {}
    summary = str(data.get("summary") or "").strip()[:SUMMARY_LIMIT]
    if not summary:
        return False
    with _lock:
        fresh = load(memory, conversation_id)
        if not fresh or fresh.summarized != c.summarized or len(fresh.turns) < c.summarized + n:
            return False  # changed meanwhile (a split, a merge): the next turn tries again
        fresh.summary = summary
        fresh.summarized = c.summarized + n
        title = str(data.get("title") or "").strip()[:TITLE_LIMIT]
        if title:
            fresh.title, fresh.titled = title, True
        save(memory, fresh)
    write_receipt(memory, Receipt(
        request=f"Summary of the conversation “{fresh.title}”", response=summary, source="hud", tier=2, at=now,
        duration_ms=r.duration_ms, intent=SUMMARY_INTENT, model=r.model, input_tokens=r.input_tokens,
        output_tokens=r.output_tokens, estimated_cost_usd=round(r.cost_usd, 6),
    ))
    return True


SUMMARY_INTENT = "conversation_summary"


def compact_in_background(memory: Path, conversation_id: str) -> None:
    """Runs `compact` in a thread (never more than one per conversation): the reply doesn't wait for it."""
    c = load(memory, conversation_id)
    if not c or _unsummarized_chars(c) <= COMPACT_AT:
        return
    with _lock:
        if conversation_id in _compacting:
            return
        _compacting.add(conversation_id)

    def run():
        try:
            compact(memory, conversation_id)
        except Exception as e:  # a summary that fails is retried on the next turn
            log.warning("conversation summary failed: %s", e)
        finally:
            with _lock:
                _compacting.discard(conversation_id)

    threading.Thread(target=run, name=f"summary-{conversation_id}", daemon=True).start()
