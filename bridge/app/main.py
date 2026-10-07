"""Bridge: FastAPI app that takes requests from every door (HUD, voice, routines)."""

import asyncio
import json
import logging
import os
import re
import secrets
from contextlib import asynccontextmanager, contextmanager
import threading
import time
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.requests import HTTPConnection
from starlette.responses import FileResponse

from app import clock, ephemeral, library, proposals, push
from app import reminders as reminder_scheduler
from app import studies
from app import studies_quiz as quiz
from app.config import get_settings
from app.events import system_events
from app.gandalf import claude_cli, tier3
from app.gandalf import router as gandalf
from app.gandalf.tier1 import task_dict
from app.locales import en
from app.receipts_index import costs_by_day, read_receipts, to_json
from app.routines import files as routine_files
from app.routines import scheduler, status as routine_status
from app.routines.actions import ACTIONS
from app.skills.catalog import has_skill, list_skills
from app.speech import voice
from app.memory import browse, clip, edit, links, reader, writer
from app.memory import reminders as reminder_store
from app.memory.tasks import sort_by_priority

Source = Literal["hud", "voice", "routine"]
Priority = Literal["highest", "high", "medium", "low", "lowest"]


def require_token(conn: HTTPConnection) -> None:
    """Bearer in the header; on WebSocket (the browser sends no header) accepts ?token=."""
    expected = get_settings().token
    is_ws = conn.scope["type"] == "websocket"
    if not expected:
        if is_ws:
            raise WebSocketException(status.WS_1011_INTERNAL_ERROR, "BRIDGE_TOKEN not configured")
        raise HTTPException(500, "BRIDGE_TOKEN not configured in .env")
    scheme, _, received = conn.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" and is_ws:
        received = conn.query_params.get("token", "")
    elif scheme.lower() != "bearer":
        received = ""
    if not received or not secrets.compare_digest(received, expected):
        if is_ws:
            raise WebSocketException(status.WS_1008_POLICY_VIOLATION, "invalid token")
        raise HTTPException(401, "invalid token")


def get_memory() -> Path:
    memory = get_settings().memory_path
    if not memory.is_dir():
        raise HTTPException(503, f"memory not found at {memory}")
    return memory


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Starts the schedulers (routines and reminders) with the Bridge (GANDALF_SCHEDULER=0 turns them off, e.g. tests)."""
    schedulers = []
    memory = get_settings().memory_path
    if os.getenv("GANDALF_VOICE_PRELOAD", "1") != "0":
        voice.preload()
    if os.getenv("GANDALF_SCHEDULER", "1") != "0" and memory.is_dir():
        schedulers = [scheduler.scheduler(memory), reminder_scheduler.scheduler(memory)]
        for s in schedulers:
            s.start()
    yield
    for s in schedulers:
        s.stop()


logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Gandalf Bridge", version="0.6.0", dependencies=[Depends(require_token)], lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cached Claude Code status: `claude auth status` takes ~1 s, and /health is called all the time.
_claude_status: dict = {"at": 0.0, "data": None}
_claude_lock = threading.Lock()


def claude_status(force: bool = False) -> dict:
    with _claude_lock:
        if force or not _claude_status["data"] or time.monotonic() - _claude_status["at"] > 60:
            _claude_status["data"] = claude_cli.login_status()
            _claude_status["at"] = time.monotonic()
        return _claude_status["data"]


@app.get("/health")
def health(claude: bool = False) -> dict:
    settings = get_settings()
    data = {
        "status": "ok",
        "version": app.version,
        "memory": str(settings.memory_path),
        "memory_exists": (settings.memory_path / "CLAUDE.md").is_file(),
        "language": settings.language,
    }
    if claude:
        data["claude"] = claude_status()
    return data


# ---------- Gandalf ----------

class PreviousTurn(BaseModel):
    question: str = Field(max_length=1000)
    answer: str = Field(max_length=1500)


class AskRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    source: Source = "hud"
    force_tier: Literal[1, 2, 3] | None = None
    confirm: bool = False
    # The last turns of the conversation (the HUD sends up to 2 recent ones) so Tier 2 understands follow-ups.
    previous: list[PreviousTurn] = Field(default_factory=list, max_length=2)
    # Study note open in the HUD ("ask Gandalf about this topic"): goes as Tier 2 context.
    note: str | None = Field(default=None, max_length=500)


@app.post("/ask")
def ask(req: AskRequest, memory: Path = Depends(get_memory)) -> dict:
    previous = [x.model_dump() for x in req.previous]
    note = None
    if req.note:
        path = (memory / req.note).resolve()
        if not path.is_relative_to((memory / "wiki").resolve()) or path.suffix != ".md" or not path.is_file():
            raise HTTPException(400, "invalid note (only notes in wiki/)")
        note_text = reader.read_text(path)
        # Study note: the user's annotations on the topic go along.
        if m := re.fullmatch(r"wiki/studies/([\w-]+)/[^_].*\.md", req.note):
            try:
                mine = studies.list_annotations(memory, m.group(1), req.note)
            except (FileNotFoundError, studies.InvalidPath):
                mine = []
            if mine:
                note_text += "\n\n## The user's annotations on this topic\n" + "\n\n".join(a["text"] for a in mine)
        note = (req.note, note_text)
    try:
        r = gandalf.ask(memory, req.text, req.source, req.force_tier, req.confirm, previous, note)
    except claude_cli.ClaudeUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except claude_cli.ClaudeFailed as e:
        raise HTTPException(502, str(e)) from e
    return asdict(r)


# ---------- Claude Code sessions (Tier 3) ----------

class Continuation(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


def _session_or_404(memory: Path, session_id: str) -> tier3.Session:
    s = tier3.manager(memory).get(session_id)
    if not s:
        raise HTTPException(404, "session not found (sessions live only in the Bridge's memory)")
    return s


@app.get("/sessions")
def list_sessions(memory: Path = Depends(get_memory)) -> list[dict]:
    return [s.summary() for s in tier3.manager(memory).sessions()]


@app.get("/sessions/{session_id}")
def get_session(session_id: str, memory: Path = Depends(get_memory)) -> dict:
    return _session_or_404(memory, session_id).summary()


@app.delete("/sessions/{session_id}")
def cancel_session(session_id: str, memory: Path = Depends(get_memory)) -> dict:
    _session_or_404(memory, session_id)
    return tier3.manager(memory).cancel(session_id).summary()


@app.post("/sessions/{session_id}/continue", status_code=201)
def continue_session(session_id: str, c: Continuation, memory: Path = Depends(get_memory)) -> dict:
    previous = _session_or_404(memory, session_id)
    if previous.status in tier3.ACTIVE:
        raise HTTPException(409, "the session is still running")
    if not previous.claude_session_id:
        raise HTTPException(409, "this session has no Claude Code id to resume")
    new = tier3.manager(memory).create(c.text, source=previous.source, resumed_from=previous.id)
    return new.summary()


@app.websocket("/ws/stream/{session_id}")
async def ws_stream(ws: WebSocket, session_id: str):
    memory = get_settings().memory_path
    m = tier3.manager(memory)
    s = m.get(session_id)
    await ws.accept()
    if not s:
        # Close after accepting: refusing in the handshake reaches the browser as a generic 1006,
        # and the HUD wouldn't know reconnecting is pointless.
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="session not found")
        return
    past, queue = m.subscribe(s, asyncio.get_running_loop())
    try:
        await ws.send_json({"type": "gandalf_status", "status": s.status, "summary": s.summary()})
        for ev in past:
            await ws.send_json(ev)
        if s.status not in tier3.ACTIVE and not any(e.get("type") == "gandalf_end" for e in past):
            await ws.send_json({"type": "gandalf_end", "status": s.status, "summary": s.summary()})
        while True:
            await ws.send_json(await queue.get())
    except WebSocketDisconnect:
        pass
    finally:
        s.channel.unsubscribe(queue)


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    queue = system_events.subscribe(asyncio.get_running_loop())
    try:
        while True:
            await ws.send_json(await queue.get())
    except WebSocketDisconnect:
        pass
    finally:
        system_events.unsubscribe(queue)


# ---------- Skills ----------

class SkillRun(BaseModel):
    instruction: str = Field(default="", max_length=4000)


def _last_by_intent(memory: Path, prefix: str) -> dict[str, dict]:
    now = clock.now()
    last: dict[str, dict] = {}
    for r in read_receipts(memory, (now - timedelta(days=60)).date(), now.date()):
        intent = r["intent"] or ""
        if intent.startswith(prefix):
            last[intent[len(prefix):]] = to_json(r)
    return last


@app.get("/skills")
def skills(memory: Path = Depends(get_memory)) -> list[dict]:
    last = _last_by_intent(memory, "skill:")
    return [{**asdict(s), "last_run": last.get(s.name)} for s in list_skills()]


@app.post("/skills/{name}/run", status_code=201)
def run_skill(name: str, e: SkillRun, memory: Path = Depends(get_memory)) -> dict:
    if not has_skill(name):
        raise HTTPException(404, f"skill not found: {name}")
    task = e.instruction.strip() or "Run this skill with its defaults."
    s = tier3.manager(memory).create(task, request=f"Skill /{name}" + (f": {e.instruction.strip()}" if e.instruction.strip() else ""), skill=name)
    return s.summary()


# ---------- Routines ----------

class NewRoutine(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    cron: str = Field(min_length=9, max_length=100)
    tier: Literal[1, 3] = 3
    active: bool = True
    skill: str | None = None
    action: str | None = None
    description: str = Field(default="", max_length=4000)
    output: Literal["memory", "ephemeral"] = "memory"
    notify: bool = False


class RoutineEdit(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    cron: str | None = Field(default=None, min_length=9, max_length=100)
    active: bool | None = None
    skill: str | None = None
    action: str | None = None
    description: str | None = Field(default=None, max_length=4000)
    output: Literal["memory", "ephemeral"] | None = None
    notify: bool | None = None


def _routine_json(memory: Path, r, history: dict[str, list[dict]]) -> dict:
    s = scheduler.scheduler(memory)
    next_run = s.next_run(r)
    runs = history.get(r.slug, [])
    hist = [
        {**e, "at": e["at"].isoformat(timespec="seconds")}
        for e in reversed(runs[-10:])
    ]
    return {**asdict(r), "next": next_run.isoformat(timespec="seconds") if next_run else None, "history": hist}


@app.get("/routines")
def list_routines(memory: Path = Depends(get_memory)) -> list[dict]:
    hist = routine_status.history(memory, clock.now())
    return [_routine_json(memory, r, hist) for r in reader.read_routines(memory)]


@app.get("/routines/actions")
def internal_actions() -> list[dict]:
    return [{"name": name, "description": desc} for name, (desc, _) in ACTIONS.items()]


@app.post("/routines", status_code=201)
def create_routine(n: NewRoutine, memory: Path = Depends(get_memory)) -> dict:
    try:
        slug = routine_files.create(
            memory, clock.tz(), name=n.name, cron_expr=n.cron, tier=n.tier, active=n.active,
            skill=n.skill, action=n.action, description=n.description, output=n.output, notify=n.notify,
        )
    except routine_files.RoutineExists as e:
        raise HTTPException(409, f"a routine with this name already exists ({e})") from e
    except routine_files.InvalidRoutine as e:
        raise HTTPException(422, str(e)) from e
    scheduler.scheduler(memory).reload()
    r = next(x for x in reader.read_routines(memory) if x.slug == slug)
    return _routine_json(memory, r, {})


@app.patch("/routines/{slug}")
def edit_routine(slug: str, e: RoutineEdit, memory: Path = Depends(get_memory)) -> dict:
    fields = {k: getattr(e, k) for k in e.model_fields_set if k != "description"}
    try:
        routine_files.update(memory, clock.tz(), slug, fields, e.description if "description" in e.model_fields_set else None)
    except routine_files.RoutineNotFound as ex:
        raise HTTPException(404, "routine not found") from ex
    except routine_files.InvalidRoutine as ex:
        raise HTTPException(422, str(ex)) from ex
    scheduler.scheduler(memory).reload()
    r = next(x for x in reader.read_routines(memory) if x.slug == slug)
    return _routine_json(memory, r, routine_status.history(memory, clock.now()))


@app.delete("/routines/{slug}", status_code=204)
def remove_routine(slug: str, memory: Path = Depends(get_memory)) -> None:
    try:
        routine_files.remove(memory, slug)
    except routine_files.RoutineNotFound as ex:
        raise HTTPException(404, "routine not found") from ex
    scheduler.scheduler(memory).reload()


@app.post("/routines/{slug}/run")
def run_routine(slug: str, memory: Path = Depends(get_memory)) -> dict:
    try:
        return scheduler.scheduler(memory).run(slug, manual=True)
    except KeyError as ex:
        raise HTTPException(404, "routine not found") from ex


# ---------- Ephemeral outputs ----------

class SaveEphemeral(BaseModel):
    target: Literal["raw", "task"]
    text: str | None = Field(default=None, max_length=20000)


def _ephemeral_or_404(ephemeral_id: str) -> ephemeral.Ephemeral:
    e = ephemeral.get(ephemeral_id)
    if not e:
        raise HTTPException(404, "item not found (it may have expired)")
    return e


@app.get("/ephemeral")
def list_ephemeral() -> list[dict]:
    return [asdict(e) for e in ephemeral.list_items()]


@app.delete("/ephemeral/{ephemeral_id}", status_code=204)
def discard_ephemeral(ephemeral_id: str) -> None:
    if not ephemeral.remove(ephemeral_id):
        raise HTTPException(404, "item not found (it may have expired)")


@app.post("/ephemeral/{ephemeral_id}/save", status_code=201)
def save_ephemeral(ephemeral_id: str, s: SaveEphemeral, memory: Path = Depends(get_memory)) -> dict:
    """Saves to the memory, by the user's choice, an excerpt (or all) of an ephemeral item."""
    e = _ephemeral_or_404(ephemeral_id)
    text = (s.text or e.text).strip()
    if s.target == "task":
        if not s.text or len(text) > 500:
            raise HTTPException(422, "give the task text (up to 500 characters)")
        return {"task": task_dict(writer.add_task(memory, text))}
    path = writer.save_raw(memory, text, clock.now(), "hud", title=e.title)
    return {"file": path.relative_to(memory).as_posix()}


@app.get("/ephemeral/{ephemeral_id}")
def get_ephemeral(ephemeral_id: str) -> dict:
    return asdict(_ephemeral_or_404(ephemeral_id))


# ---------- Research (web) and Library ----------

class NewResearch(BaseModel):
    request: str = Field(min_length=1, max_length=2000)
    topic: str | None = Field(default=None, max_length=80)
    kind: Literal["research", "plan"] = "research"
    update: str | None = Field(default=None, max_length=80)  # slug of a Library topic


@app.post("/research", status_code=201)
def new_research(p: NewResearch, memory: Path = Depends(get_memory)) -> dict:
    """Direct research (e.g. "Update" in the Library), without going through Tier 2. Web only, no memory."""
    task = p.request
    if p.update:
        try:
            saved = library.context_for_update(memory, p.update)
        except (FileNotFoundError, library.InvalidTopic) as e:
            raise HTTPException(404, "topic not found in the Library") from e
        task += gandalf.UPDATE_CONTEXT.format(saved=saved)
    topic = p.topic or (library.detail(memory, p.update)["title"] if p.update else p.request[:60])
    s = tier3.manager(memory).create(
        task, request=p.request, skill="research", output="research",
        research={"topic": topic, "kind": p.kind, "request": p.request, "slug": p.update},
    )
    return s.summary()


@app.post("/research/{ephemeral_id}/save", status_code=201)
def save_research(ephemeral_id: str, memory: Path = Depends(get_memory)) -> dict:
    """The user approved: another session (no web, writes only in wiki/library/) organizes it by topic."""
    e = _ephemeral_or_404(ephemeral_id)
    if not e.research:
        raise HTTPException(422, "this item is not research")
    meta = e.research
    target = f"Update the existing topic `{meta['slug']}`." if meta.get("slug") else "Create a new topic."
    task = (
        f"Save this {meta.get('kind', 'research')} in the Library. Topic: {meta.get('topic')}. {target}\n"
        f"The user's original request: {meta.get('request', '')}\n\n<report>\n{e.text}\n</report>"
    )
    s = tier3.manager(memory).create(
        task, request=f"Save to the Library: {meta.get('topic')}", skill="save-research", output="library",
        research={**meta, "ephemeral_id": e.id},
    )
    return s.summary()


@app.get("/library")
def list_library(memory: Path = Depends(get_memory)) -> list[dict]:
    return library.list_topics(memory)


@app.get("/library/{slug}")
def library_topic(slug: str, memory: Path = Depends(get_memory)) -> dict:
    try:
        return library.detail(memory, slug)
    except (FileNotFoundError, library.InvalidTopic) as e:
        raise HTTPException(404, "topic not found") from e


@app.post("/library/{slug}/tasks", status_code=201)
def library_tasks(slug: str, memory: Path = Depends(get_memory)) -> dict:
    """Open checklist items of the topic become tasks (no AI)."""
    try:
        return {"created": library.checklist_to_tasks(memory, slug, clock.now().date())}
    except (FileNotFoundError, library.InvalidTopic) as e:
        raise HTTPException(404, "topic or checklist not found") from e


# ---------- Studies ----------

class StudyRequest(BaseModel):
    request: str = Field(default="", max_length=2000)
    kind: Literal["subject", "topic", "deepen"] = "subject"
    note: str | None = Field(default=None, max_length=500)


def _studies(fn):
    """Turns the studies module's path errors into 404/400."""
    try:
        return fn()
    except FileNotFoundError as e:
        raise HTTPException(404, "subject not found") from e
    except studies.InvalidPath as e:
        raise HTTPException(400, f"invalid note: {e}") from e


@app.get("/studies")
def list_studies(memory: Path = Depends(get_memory)) -> list[dict]:
    return studies.list_subjects(memory)


@app.get("/studies/{subject}")
def study_subject(subject: str, memory: Path = Depends(get_memory)) -> dict:
    return _studies(lambda: studies.detail(memory, subject))


@app.delete("/studies/{subject}")
def remove_study_subject(subject: str, memory: Path = Depends(get_memory)) -> dict:
    """Deletes the whole subject: topics, annotations and uploaded material. No undo (besides the memory's git)."""
    return _studies(lambda: studies.remove_subject(memory, subject))


class QuizRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=quiz.MAX_QUESTIONS)
    type: Literal["text", "multiple"] = "multiple"
    topic: str | None = Field(default=None, max_length=500)


class QuizAnswer(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    model_answer: str = Field(min_length=1, max_length=4000)
    answer: str = Field(default="", max_length=4000)
    topic: str | None = Field(default=None, max_length=500)


def _quiz(fn):
    try:
        return _studies(fn)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except claude_cli.ClaudeUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except claude_cli.ClaudeFailed as e:
        raise HTTPException(502, str(e)) from e


@app.post("/studies/{subject}/quiz")
def study_quiz(subject: str, q: QuizRequest, memory: Path = Depends(get_memory)) -> dict:
    """Ephemeral quiz (not stored): questions from the topic or, with no topic, from the whole subject."""
    return _quiz(lambda: quiz.generate(memory, subject, q.count, q.type, clock.now(), q.topic or None))


@app.post("/studies/{subject}/quiz/grade")
def study_quiz_grade(subject: str, r: QuizAnswer, memory: Path = Depends(get_memory)) -> dict:
    """Grades a free-text quiz answer (the HUD checks multiple choice by itself)."""
    return _quiz(lambda: quiz.grade(memory, subject, r.question, r.model_answer, r.answer, clock.now(), r.topic or None))


class NewAnnotation(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    title: str | None = Field(default=None, max_length=120)
    topic: str | None = Field(default=None, max_length=500)
    source: Literal["quiz"] | None = None  # a question saved from the quiz


class AnnotationEdit(BaseModel):
    file: str = Field(min_length=1, max_length=500)
    text: str = Field(min_length=1, max_length=50_000)
    title: str | None = Field(default=None, max_length=120)


@app.get("/studies/{subject}/annotations")
def study_annotations(subject: str, topic: str | None = None, memory: Path = Depends(get_memory)) -> list[dict]:
    """The user's annotations: for one topic, or all (general ones have an empty `topic`)."""
    return _studies(lambda: studies.list_annotations(memory, subject, topic))


@app.post("/studies/{subject}/annotations", status_code=201)
def create_study_annotation(subject: str, a: NewAnnotation, memory: Path = Depends(get_memory)) -> dict:
    return _studies(lambda: studies.create_annotation(memory, subject, a.text, clock.now(), a.title, a.topic, a.source))


@app.put("/studies/{subject}/annotations")
def edit_study_annotation(subject: str, a: AnnotationEdit, memory: Path = Depends(get_memory)) -> dict:
    return _studies(lambda: studies.update_annotation(memory, subject, a.file, a.text, clock.now(), a.title))


@app.delete("/studies/{subject}/annotations", status_code=204)
def remove_study_annotation(subject: str, file: str, memory: Path = Depends(get_memory)) -> None:
    _studies(lambda: studies.remove_annotation(memory, subject, file))


@app.post("/studies/{subject}/material", status_code=201)
async def study_material(
    subject: str,
    files: list[UploadFile] = File(default=[]),
    text: str = Form(default=""),
    topic: str = Form(default=""),
    structure: bool = Form(default=True),
    memory: Path = Depends(get_memory),
) -> dict:
    """Documents and/or text about the subject: stored in `_sources/` and (by default) Gandalf is asked to
    structure them into new topics or add them to existing ones (structure-material skill)."""
    now = clock.now()
    _studies(lambda: studies.subject_folder(memory, subject))
    if topic:
        _studies(lambda: studies.subject_note(memory, subject, topic))
    if not files and not text.strip():
        raise HTTPException(422, "send a file or paste some text")
    saved: list[str] = []
    for f in files[:10]:
        data = await f.read()
        if len(data) > 25 * 1024 * 1024:
            raise HTTPException(413, f"{f.filename}: larger than 25 MB")
        try:
            saved += studies.save_source(memory, subject, f.filename or "file", data, now)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
    if text.strip():
        first = text.strip().splitlines()[0][:50] or "text"
        saved += studies.save_source(memory, subject, f"{first}.md", text.strip().encode("utf-8"), now)
    if not structure:
        return {"sources": saved, "session": None}
    target = f" The user sent this with the topic `{topic}` in mind: prioritize adding to it." if topic else ""
    task = (
        f"Structure the new material for the subject `wiki/studies/{subject}/`. Files sent now:\n"
        + "\n".join(f"- `{s}`" for s in saved)
        + f"\n{target}"
    )
    skill = "structure-material" if has_skill("structure-material") else None
    s = tier3.manager(memory).create(task, request=f"Material for {subject}: {', '.join(x.split('/')[-1] for x in saved)[:120]}", skill=skill)
    return {"sources": saved, "session": s.summary()}


@app.post("/studies/generate", status_code=201)
def generate_study(p: StudyRequest, memory: Path = Depends(get_memory)) -> dict:
    """Generates material with Claude Code (prepare-studies skill): a new subject, a new topic or deepening a topic."""
    skill = "prepare-studies" if has_skill("prepare-studies") else None
    if p.kind == "deepen":
        if not p.note or not p.note.startswith("wiki/studies/") or ".." in p.note or not (memory / p.note).is_file():
            raise HTTPException(400, "give the note (wiki/studies/...)")
        extra = f" The user's request: {p.request.strip()}" if p.request.strip() else ""
        task = f"Deepen the existing topic `{p.note}`.{extra}"
        s = tier3.manager(memory).create(task, request=f"Deepen: {p.note.split('/')[-1]}", skill=skill)
        return s.summary()
    if not p.request.strip():
        raise HTTPException(422, "say what to study")
    prefix = "Complete the existing subject with a new topic" if p.kind == "topic" else "Put together the study material"
    s = tier3.manager(memory).create(f"{prefix}: {p.request}", request=f"Studies: {p.request[:80]}", skill=skill)
    return s.summary()


# ---------- Voice (offline) ----------

class Speech(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    summarize: bool = True
    voice: str | None = Field(default=None, max_length=40)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


@app.get("/voice/status")
def voice_status() -> dict:
    return voice.status()


@app.post("/voice/listen")
async def voice_listen(audio: UploadFile = File(...)) -> dict:
    """Audio recorded in the HUD → text (Whisper, in the user's language)."""
    data = await audio.read()
    if not data:
        raise HTTPException(422, "empty audio")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "audio larger than 15 MB")
    start = time.perf_counter()
    try:
        r = await asyncio.to_thread(voice.transcribe, data)
    except voice.VoiceUnavailable as e:
        raise HTTPException(503, str(e)) from e
    return {**r, "duration_ms": round((time.perf_counter() - start) * 1000)}


@app.post("/voice/speak")
def voice_speak(f: Speech) -> Response:
    """Text → WAV (Kokoro). Long answers become just the beginning + "the details are on the screen"."""
    text = voice.text_for_speech(f.text) if f.summarize else f.text
    try:
        wav = voice.synthesize(text, f.voice, f.speed)
    except voice.VoiceUnavailable as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    # ASCII-only header: the spoken text goes URL-encoded.
    from urllib.parse import quote

    return Response(wav, media_type="audio/wav", headers={"X-Spoken-Text": quote(text)})


# ---------- Receipts and costs ----------

@app.get("/receipts")
def list_receipts(
    days: int = 30,
    limit: int = 200,
    tier: int | None = None,
    source: str | None = None,
    memory: Path = Depends(get_memory),
) -> list[dict]:
    """Receipts from the last `days`, newest first."""
    today = clock.now().date()
    items = read_receipts(memory, today - timedelta(days=max(0, min(days, 366))), today)
    if tier is not None:
        items = [r for r in items if r["tier"] == tier]
    if source:
        items = [r for r in items if r["source"] == source]
    return [to_json(r) for r in reversed(items)][: max(1, min(limit, 2000))]


@app.get("/receipts/{receipt_id}")
def read_receipt(receipt_id: str, memory: Path = Depends(get_memory)) -> dict:
    if not re.fullmatch(r"[0-9A-Z]{26}", receipt_id):
        raise HTTPException(404, "receipt not found")
    today = clock.now().date()
    r = next((x for x in read_receipts(memory, today - timedelta(days=366), today) if x["id"] == receipt_id), None)
    if not r:
        raise HTTPException(404, "receipt not found")
    return {**to_json(r), **browse.read_note(memory, r["file"])}


@app.get("/costs")
def costs(days: int = 30, memory: Path = Depends(get_memory)) -> dict:
    """Usage per day and totals. The cost is the "API equivalent" reported by Claude Code (for reference)."""
    now = clock.now()
    today = now.date()
    by_day = costs_by_day(read_receipts(memory, today - timedelta(days=max(1, min(days, 366)) - 1), today))
    month = costs_by_day(read_receipts(memory, today.replace(day=1), today))

    def total(items: list[dict]) -> dict:
        return {
            "calls": {x: sum(d["calls"][x] for d in items) for x in ("1", "2", "3")},
            "tokens": sum(d["input_tokens"] + d["output_tokens"] for d in items),
            "estimated_cost_usd": round(sum(d["estimated_cost_usd"] for d in items), 4),
        }

    today_iso = today.isoformat()
    of_today = [d for d in by_day if d["day"] == today_iso]
    return {
        "date": today_iso,
        "by_day": by_day,
        "period": total(by_day),
        "month": total(month),
        "today": total(of_today),
        "daily_call_limit": get_settings().daily_call_limit,
    }


# ---------- Memory (browse and edit) ----------

@contextmanager
def _memory_errors():
    """The memory's file errors as HTTP errors."""
    try:
        yield
    except browse.InvalidPath as e:
        raise HTTPException(400, f"invalid path: {e}") from e
    except FileNotFoundError as e:
        raise HTTPException(404, "file not found") from e
    except FileExistsError as e:
        raise HTTPException(409, f"already exists: {e}") from e


@app.get("/memory/tree")
def memory_tree(memory: Path = Depends(get_memory)) -> list[dict]:
    return browse.tree(memory)


@app.get("/memory/note")
def memory_note(path: str, memory: Path = Depends(get_memory)) -> dict:
    with _memory_errors():
        try:
            note = browse.read_note(memory, path)
        except FileNotFoundError:
            # [[note]] by name only: the unique note with that name, wherever it is.
            found = links.Resolver(memory)(path.removesuffix(".md"))
            if not found:
                raise
            note = browse.read_note(memory, found)
    top = Path(note["path"].replace("\\", "/").lstrip("/")).parts[:1]
    return {**note, "editable": not note["binary"] and not (top and top[0] in edit.READ_ONLY)}


class NoteSave(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=2 * 1024 * 1024)
    # The version the editor opened (from GET /memory/note); null skips the conflict check.
    base: str | None = Field(default=None, max_length=40)


class NoteCreate(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(default="", max_length=2 * 1024 * 1024)


class NoteMove(BaseModel):
    src: str = Field(min_length=1, max_length=500)
    dst: str = Field(min_length=1, max_length=500)


@app.put("/memory/note")
def memory_save(n: NoteSave, memory: Path = Depends(get_memory)) -> dict:
    try:
        with _memory_errors():
            return {"path": n.path, "version": edit.save(memory, n.path, n.content, n.base)}
    except edit.Conflict as e:
        raise HTTPException(409, "the note changed since you opened it (Gandalf or another device saved it)") from e


@app.post("/memory/note", status_code=201)
def memory_create(n: NoteCreate, memory: Path = Depends(get_memory)) -> dict:
    with _memory_errors():
        return {"path": edit.create(memory, n.path, n.content)}


@app.delete("/memory/note")
def memory_delete(path: str, memory: Path = Depends(get_memory)) -> dict:
    with _memory_errors():
        return {"trash": edit.delete(memory, path, clock.now())}


@app.post("/memory/move")
def memory_move(m: NoteMove, memory: Path = Depends(get_memory)) -> dict:
    with _memory_errors():
        return edit.move(memory, m.src, m.dst)


@app.get("/memory/file")
def memory_file(path: str, memory: Path = Depends(get_memory)) -> FileResponse:
    """A file as it is (PDFs and images shown in the HUD)."""
    with _memory_errors():
        target = browse.resolve(memory, path)
        if not target.is_file():
            raise FileNotFoundError(path)
    return FileResponse(target)


@app.get("/memory/search")
def memory_search(q: str = Query(min_length=1, max_length=200), memory: Path = Depends(get_memory)) -> list[dict]:
    return links.search(memory, q)


@app.get("/memory/backlinks")
def memory_backlinks(path: str, memory: Path = Depends(get_memory)) -> list[dict]:
    return links.backlinks(memory, path)


@app.get("/memory/health")
def memory_health(memory: Path = Depends(get_memory)) -> dict:
    """The wiki's mechanical health check (no AI): broken links, orphans, missing index entries…"""
    return links.health(memory)


# ---------- Today ----------

@app.get("/today")
def today(memory: Path = Depends(get_memory)) -> dict:
    """The day's dashboard, read straight from the memory (pure Tier 1)."""
    now = clock.now()
    day = now.date()
    tasks = reader.read_tasks(memory)
    open_tasks = sort_by_priority(tasks, day)
    return {
        "date": day.isoformat(),
        "date_long": en.date_long(day),
        "now": now.isoformat(timespec="seconds"),
        "agenda": [asdict(e) for e in reader.read_agenda(memory, day)],
        "priorities": [task_dict(x) for x in open_tasks[:3]],
        "tasks": {
            "open": len(open_tasks),
            "today": sum(1 for x in open_tasks if x.due == day),
            "overdue": sum(1 for x in open_tasks if x.due and x.due < day),
            "done_today": sum(1 for x in tasks if x.done and x.done_on == day),
        },
        "routines": routine_status.routines_today(memory, now, clock.tz()),
    }


# ---------- Tasks ----------

class NewTask(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    due: date | None = None
    priority: Priority | None = None
    tags: list[str] = []


class TaskEdit(BaseModel):
    done: bool | None = None
    text: str | None = Field(default=None, min_length=1, max_length=500)
    due: date | None = None
    priority: Priority | None = None


@app.get("/tasks")
def list_tasks(include_done: bool = False, memory: Path = Depends(get_memory)) -> list[dict]:
    day = clock.now().date()
    tasks = reader.read_tasks(memory)
    open_tasks = sort_by_priority(tasks, day)
    done = [x for x in tasks if x.done] if include_done else []
    return [task_dict(x) for x in open_tasks + done]


@app.post("/tasks", status_code=201)
def create_task(new: NewTask, memory: Path = Depends(get_memory)) -> dict:
    tags = [x.lstrip("#") for x in new.tags]
    x = writer.add_task(memory, new.text, due=new.due, priority=new.priority, tags=tags)
    return task_dict(x)


@app.patch("/tasks/{task_id}")
def edit_task(task_id: str, edit: TaskEdit, memory: Path = Depends(get_memory)) -> dict:
    fields = edit.model_fields_set
    try:
        x = writer.update_task(
            memory,
            task_id,
            clock.now().date(),
            done=edit.done,
            text=edit.text,
            due=edit.due if "due" in fields else ...,
            priority=edit.priority if "priority" in fields else ...,
        )
    except writer.TaskNotFound as e:
        raise HTTPException(404, "task not found (the file may have changed; reload)") from e
    return task_dict(x)


# ---------- Reminders ----------

class NewReminder(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    when: datetime | None = None
    recurrence: str | None = Field(default=None, max_length=100)


class ReminderEdit(BaseModel):
    done: bool | None = None
    text: str | None = Field(default=None, min_length=1, max_length=300)
    when: datetime | None = None
    snooze_min: int | None = Field(default=None, ge=1, le=7 * 24 * 60)


def _reminders_json(memory: Path) -> list[dict]:
    s = reminder_scheduler.scheduler(memory)
    now = clock.now()
    items = reminder_store.read(memory, clock.tz())
    pending = sorted((x for x in items if not x.done), key=lambda x: s.next_fire(x, now) or now)
    fired = sorted((x for x in items if x.done and not x.recurring), key=lambda x: x.done_at or now, reverse=True)
    # "Just fired": the HUD offers to snooze (on iPhone the notification has no buttons).
    recent = lambda x: bool(x.done and x.done_at and now - x.done_at <= timedelta(hours=2))  # noqa: E731
    return [
        {**reminder_scheduler.reminder_json(x, s.next_fire(x, now)), "recently_fired": recent(x)}
        for x in pending + fired[:10]
    ]


@app.get("/reminders")
def list_reminders(memory: Path = Depends(get_memory)) -> list[dict]:
    """Pending ones (nearest first) and the last 10 fired."""
    return _reminders_json(memory)


@app.post("/reminders", status_code=201)
def create_reminder(n: NewReminder, memory: Path = Depends(get_memory)) -> dict:
    tz = clock.tz()
    when = n.when.astimezone(tz) if n.when and n.when.tzinfo else (n.when.replace(tzinfo=tz) if n.when else None)
    try:
        x = reminder_store.add(memory, tz, n.text, when=when, recurrence=n.recurrence)
    except reminder_store.InvalidReminder as e:
        raise HTTPException(422, str(e)) from e
    reminder_scheduler.reload_if_running(memory)
    return reminder_scheduler.reminder_json(x, reminder_scheduler.scheduler(memory).next_fire(x))


@app.patch("/reminders/{reminder_id}")
def edit_reminder(reminder_id: str, e: ReminderEdit, memory: Path = Depends(get_memory)) -> dict:
    """Complete/reopen, change the text, reschedule or snooze N minutes from now."""
    tz = clock.tz()
    now = clock.now()
    when = e.when
    if e.snooze_min:
        when = (now + timedelta(minutes=e.snooze_min)).replace(second=0, microsecond=0)
    elif when is not None:
        when = when.astimezone(tz) if when.tzinfo else when.replace(tzinfo=tz)
    try:
        x = reminder_store.update(memory, tz, reminder_id, done=e.done, text=e.text, when=when, now=now)
    except reminder_store.ReminderNotFound as ex:
        raise HTTPException(404, "reminder not found (the file may have changed; reload)") from ex
    except reminder_store.InvalidReminder as ex:
        raise HTTPException(422, str(ex)) from ex
    reminder_scheduler.reload_if_running(memory)
    return reminder_scheduler.reminder_json(x, reminder_scheduler.scheduler(memory).next_fire(x))


@app.delete("/reminders/{reminder_id}", status_code=204)
def remove_reminder(reminder_id: str, memory: Path = Depends(get_memory)) -> None:
    try:
        reminder_store.remove(memory, clock.tz(), reminder_id)
    except reminder_store.ReminderNotFound as ex:
        raise HTTPException(404, "reminder not found") from ex
    reminder_scheduler.reload_if_running(memory)


# ---------- Pomodoro ----------

class Pomodoro(BaseModel):
    end: datetime
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=200)


@app.post("/pomodoro")
def schedule_pomodoro(p: Pomodoro, memory: Path = Depends(get_memory)) -> dict:
    """The HUD schedules the push for the end of the phase: it reaches the phone even with the app closed (browsers pause timers)."""
    end = p.end if p.end.tzinfo else p.end.replace(tzinfo=clock.tz())
    if end <= clock.now():
        raise HTTPException(422, "the end time has already passed")
    return {"scheduled": reminder_scheduler.scheduler(memory).schedule_alert("pomodoro", end, p.title, p.body)}


@app.delete("/pomodoro")
def cancel_pomodoro(memory: Path = Depends(get_memory)) -> dict:
    return {"cancelled": reminder_scheduler.scheduler(memory).cancel_alert("pomodoro")}


# ---------- Notifications (Web Push) ----------

class Subscription(BaseModel):
    subscription: dict
    device: str = Field(default="", max_length=80)


class Endpoint(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)


@app.get("/push/key")
def push_key() -> dict:
    return {"key": push.public_key()}


@app.get("/push/subscriptions")
def push_subscriptions() -> list[dict]:
    return push.subscriptions()


@app.post("/push/subscribe", status_code=201)
def push_subscribe(s: Subscription) -> dict:
    try:
        return push.subscribe(s.subscription, s.device or "device")
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@app.post("/push/unsubscribe")
def push_unsubscribe(e: Endpoint) -> dict:
    return {"removed": push.unsubscribe(e.endpoint)}


@app.post("/push/test")
def push_test() -> dict:
    sent = push.send(push.Notification("🌱 Gandalf notifications are on", "This is how reminders will arrive.", "/", tag="test"))
    if not sent:
        raise HTTPException(409, "no device received it (turn on notifications on this device first)")
    return {"sent": sent}


# ---------- Proposed events (Google Calendar, with confirmation) ----------

class ProposedEvent(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    date: date
    all_day: bool = False
    start_time: str | None = None
    end_time: str | None = None
    repeat: Literal["yearly", "monthly", "weekly", "daily"] | None = None
    reminders_min: list[int] | None = None
    location: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class Confirmation(BaseModel):
    event: ProposedEvent | None = None  # fields edited in the HUD; without it, the proposal is used as it came


def _proposal_or_404(proposal_id: str) -> proposals.Proposal:
    p = proposals.get(proposal_id)
    if not p:
        raise HTTPException(404, "proposal not found (it may have expired)")
    return p


@app.get("/proposals/{proposal_id}")
def get_proposal(proposal_id: str) -> dict:
    return asdict(_proposal_or_404(proposal_id))


@app.post("/proposals/{proposal_id}/confirm", status_code=201)
def confirm_proposal(proposal_id: str, c: Confirmation, memory: Path = Depends(get_memory)) -> dict:
    """The user confirmed: opens a short session with the `schedule-event` skill to create exactly this event."""
    p = _proposal_or_404(proposal_id)
    if p.status == "confirmed":
        raise HTTPException(409, "this proposal was already confirmed")
    if not has_skill("schedule-event"):
        raise HTTPException(503, "schedule-event skill not found in skills/")
    try:
        event = proposals.normalize(c.event.model_dump(mode="json") if c.event else asdict(p.event))
    except proposals.InvalidProposal as e:
        raise HTTPException(422, str(e)) from e
    args = proposals.create_event_args(event, get_settings().timezone)
    task = (
        "Create this event on the primary Google Calendar, with exactly these create_event tool parameters "
        "(don't change anything):\n```json\n" + json.dumps(args, ensure_ascii=False, indent=1) + "\n```"
    )
    s = tier3.manager(memory).create(
        task,
        request=f"Add to calendar: {event.title} ({en.date_long(date.fromisoformat(event.date))})",
        source=p.source if p.source in ("hud", "voice") else "hud",
        skill="schedule-event",
        output="action",
        model=get_settings().schedule_event_model,
    )
    p = proposals.confirm(p, event, s.id)
    return {"proposal": asdict(p), "session": s.summary()}


@app.delete("/proposals/{proposal_id}", status_code=204)
def discard_proposal(proposal_id: str) -> None:
    if not proposals.remove(proposal_id):
        raise HTTPException(404, "proposal not found")


# ---------- Quick capture ----------

class Capture(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    title: str | None = None
    source: Source = "hud"
    # answer: a chat answer the user chose to keep (compile-raw folds it into the wiki).
    kind: Literal["capture", "answer"] = "capture"


@app.post("/raw", status_code=201)
def capture(c: Capture, memory: Path = Depends(get_memory)) -> dict:
    path = writer.save_raw(memory, c.text, clock.now(), c.source, c.title, c.kind)
    return {"file": path.relative_to(memory).as_posix()}


@app.post("/raw/file", status_code=201)
async def capture_file(file: UploadFile = File(...), memory: Path = Depends(get_memory)) -> dict:
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "file larger than 25 MB")
    path = writer.save_raw_file(memory, file.filename or "file", data, clock.now())
    return {"file": path.relative_to(memory).as_posix()}


class Clip(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    note: str = Field(default="", max_length=2000)


@app.post("/raw/url", status_code=201)
def capture_url(c: Clip, memory: Path = Depends(get_memory)) -> dict:
    """Web clipper: the page's main text as Markdown in raw/ (compile-raw turns it into wiki notes)."""
    try:
        path = clip.clip(memory, c.url, clock.now(), c.note)
    except clip.ClipError as e:
        raise HTTPException(422, str(e)) from e
    return {"file": path.relative_to(memory).as_posix()}


def run() -> None:
    """`python -m app.main` (development, reloads on edit) or `--production` (no reload)."""
    import sys

    import uvicorn

    settings = get_settings()
    production = "--production" in sys.argv
    # app.server: the API at /api + the built HUD at the root (a single origin, for the phone).
    uvicorn.run(
        "app.server:application",
        host=settings.host,
        port=settings.port,
        # Reload only on changes to the app's code (watching .venv freezes the reloader while installing packages).
        reload=not production,
        reload_dirs=None if production else [str(Path(__file__).parent)],
        # Without this the reload waits forever for the HUD's open WebSockets.
        timeout_graceful_shutdown=2,
    )


if __name__ == "__main__":
    run()
