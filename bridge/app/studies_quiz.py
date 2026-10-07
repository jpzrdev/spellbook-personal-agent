"""Ephemeral quiz for the Studies tab: the AI writes questions from the subject's material and grades the answers.

Nothing from the quiz is stored: the questions go to the HUD and disappear when it ends. The user can save
a question as an annotation (regular annotation route). Receipts record only the cost, not the content.
"""

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import frontmatter

from app import locales
from app.config import get_settings
from app.gandalf import claude_cli
from app.gandalf.tier2 import extract_json
from app.receipts import Receipt, write_receipt
from app.studies import list_annotations, md_title, subject_folder, subject_note, topics

MAX_QUESTIONS = 15
TYPES = ("text", "multiple")
TOPIC_LIMIT = 24_000  # characters of one topic note sent to the AI
SUBJECT_LIMIT = 60_000  # characters of the whole subject (general quiz)

GENERATE_SYSTEM = """You write study quizzes from the user's study material, in {language}.

Rules:
- Use only what the material supports; don't invent facts. The user's annotations also count as material.
- Questions that test understanding and application (why, how, compare, what would happen if, practical scenario), not just memorized definitions. Vary the difficulty.
- No repeated or near-identical questions. Cover different parts of the material.
- Type "text": a short free-answer question (1 to 4 sentences). In `answer`, the complete model answer.
- Type "multiple": exactly 4 options in `options`, only one correct (index 0–3 in `correct`), plausible distractors of roughly the same length as the correct one; vary the position of the correct one. In `answer`, the text of the correct option.
- `explanation`: 1 to 3 sentences explaining why the answer is right (and, for multiple choice, why the others are not), with an extra detail from the material.
- `topic`: the path (`path` attribute) of the topic the question came from.
- Reply only with the requested JSON."""

GRADE_SYSTEM = """You grade study quiz answers, in {language}, like a fair and direct teacher.

Compare the user's answer with the model answer and with the material (if any). Judge the content, not the writing:
synonyms, a different order or different words are fine. An empty answer or "I don't know" is wrong.
- `verdict`: "correct" (got the essentials), "partial" (partly right, missing something important or with a minor error) or "wrong".
- `comment`: 1 to 3 sentences speaking to the user (you): what they got right and what is missing or wrong.
- `detail`: the right answer explained, with an extra detail from the material that helps it stick (2 to 5 sentences, simple Markdown).
Reply only with the requested JSON."""

GENERATE_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correct": {"type": "integer"},
                    "answer": {"type": "string"},
                    "explanation": {"type": "string"},
                    "topic": {"type": "string"},
                },
                "required": ["question", "answer"],
            },
        }
    },
    "required": ["questions"],
}

GRADE_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["correct", "partial", "wrong"]},
        "comment": {"type": "string"},
        "detail": {"type": "string"},
    },
    "required": ["verdict", "comment"],
}


@dataclass
class Source:
    note: str
    title: str
    text: str


def _note_text(path: Path) -> str:
    return frontmatter.load(path).content.strip()


def _annotations_text(memory: Path, subject: str, topic: str | None) -> str:
    items = list_annotations(memory, subject, topic) if topic else [a for a in list_annotations(memory, subject) if not a["topic"]]
    return "\n\n".join(f"- {a['title'] + ': ' if a['title'] else ''}{a['text']}" for a in items)


def material(memory: Path, subject: str, topic: str | None) -> list[Source]:
    """Notes that go into the quiz: the chosen topic, or all of them (trimmed to fit the limit)."""
    if topic:
        path = subject_note(memory, subject, topic)
        text = _note_text(path)[:TOPIC_LIMIT]
        if mine := _annotations_text(memory, subject, topic):
            text += f"\n\n## User's annotations\n{mine[:6000]}"
        return [Source(topic, md_title(text, path.stem), text)]
    tops = topics(memory, subject)
    if not tops:
        return []
    per_topic = max(2_000, SUBJECT_LIMIT // len(tops))
    sources = []
    for x in tops:
        text = _note_text(memory / x.note)[:per_topic]
        if mine := _annotations_text(memory, subject, x.note):
            text += f"\n\n## User's annotations\n{mine[:1500]}"
        sources.append(Source(x.note, x.title, text))
    return sources


def _args(system: str, schema: dict) -> list[str]:
    return [
        "--model", get_settings().tier2_model,
        "--tools", "",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--system-prompt", system.format(language=locales.current().NAME),
        "--json-schema", json.dumps(schema, ensure_ascii=False),
    ]


def _receipt(memory: Path, now: datetime, request: str, intent: str, r: claude_cli.JsonResult, start: float) -> None:
    write_receipt(memory, Receipt(
        request, "(ephemeral quiz: the content is not stored)", "hud", 2, now, int((time.monotonic() - start) * 1000),
        intent=intent, model=r.model, input_tokens=r.input_tokens, output_tokens=r.output_tokens,
        estimated_cost_usd=round(r.cost_usd, 6),
    ))


def _clean(p: dict, kind: str, notes: set[str], default: str | None) -> dict | None:
    question = str(p.get("question") or "").strip()
    answer = str(p.get("answer") or "").strip()
    if not question or not answer:
        return None
    topic = str(p.get("topic") or "").strip()
    item = {
        "question": question,
        "answer": answer,
        "explanation": str(p.get("explanation") or "").strip(),
        "topic": topic if topic in notes else default,
        "options": None,
        "correct": None,
    }
    if kind == "multiple":
        options = [str(o).strip() for o in p.get("options") or [] if str(o).strip()][:6]
        correct = p.get("correct")
        if len(options) < 2 or not isinstance(correct, int) or not 0 <= correct < len(options):
            return None
        item.update(options=options, correct=correct)
    return item


def generate(memory: Path, subject: str, count: int, kind: str, now: datetime, topic: str | None = None) -> dict:
    """Generates `count` questions (free text or multiple choice) from the topic or the whole subject."""
    if kind not in TYPES:
        raise ValueError(f"invalid type: {kind}")
    count = max(1, min(MAX_QUESTIONS, count))
    subject_folder(memory, subject)
    sources = material(memory, subject, topic)
    if not sources:
        raise ValueError("this subject has no topics yet")
    blocks = "\n\n".join(f'<topic path="{s.note}" title="{s.title}">\n{s.text}\n</topic>' for s in sources)
    scope = f'the topic "{sources[0].title}"' if topic else "the whole subject (mix different topics at random)"
    prompt = (
        f'<quiz_generate count="{count}" type="{kind}">\n'
        f"Write {count} question(s) of type \"{kind}\" about {scope}.\n\n{blocks}\n</quiz_generate>"
    )
    notes = {s.note for s in sources}
    start = time.monotonic()
    questions: list[dict] = []
    for _ in (1, 2):  # invalid JSON or no usable question: try once more
        r = claude_cli.run_json(prompt, _args(GENERATE_SYSTEM, GENERATE_SCHEMA), cwd=memory, timeout_s=240)
        data = r.structured if r.structured and "questions" in r.structured else extract_json(r.text)
        raw = (data or {}).get("questions") if isinstance(data, dict) else None
        questions = [x for x in (_clean(p, kind, notes, topic) for p in raw or [] if isinstance(p, dict)) if x]
        if questions:
            break
    _receipt(memory, now, f"Quiz on {subject}{' (' + sources[0].title + ')' if topic else ''}: {count} {kind}", "studies.quiz", r, start)
    if not questions:
        raise claude_cli.ClaudeFailed("the AI did not return valid questions; try again")
    titles = {s.note: s.title for s in sources}
    return {
        "type": kind,
        "topic": topic,
        "questions": [{**q, "topic_title": titles.get(q["topic"]) if q["topic"] else None} for q in questions[:count]],
    }


def grade(memory: Path, subject: str, question: str, model_answer: str, answer: str, now: datetime,
          topic: str | None = None) -> dict:
    """Grades a free-text answer against the model answer (and the topic, if any)."""
    subject_folder(memory, subject)
    context = ""
    if topic:
        path = subject_note(memory, subject, topic)
        context = f'<material path="{topic}">\n{_note_text(path)[:12_000]}\n</material>\n\n'
    prompt = (
        f"<quiz_grade>\n{context}<question>\n{question.strip()}\n</question>\n\n"
        f"<model_answer>\n{model_answer.strip()}\n</model_answer>\n\n"
        f"<user_answer>\n{answer.strip() or '(blank)'}\n</user_answer>\n</quiz_grade>"
    )
    start = time.monotonic()
    data = None
    for _ in (1, 2):
        r = claude_cli.run_json(prompt, _args(GRADE_SYSTEM, GRADE_SCHEMA), cwd=memory, timeout_s=120)
        data = r.structured if r.structured and r.structured.get("verdict") else extract_json(r.text)
        if data and data.get("verdict") in ("correct", "partial", "wrong"):
            break
        data = None
    _receipt(memory, now, f"Quiz grading for {subject}", "studies.quiz.grade", r, start)
    if not data:
        raise claude_cli.ClaudeFailed("the AI could not grade the answer; try again")
    return {
        "verdict": data["verdict"],
        "comment": str(data.get("comment") or "").strip(),
        "detail": re.sub(r"\n{3,}", "\n\n", str(data.get("detail") or "").strip()),
    }
