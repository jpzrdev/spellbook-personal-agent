"""Fake Claude Code for tests: imitates `claude -p --output-format json|stream-json`.

The behavior comes from the request text (stdin):
- Tier 2 (json), looking only at the `<request>`: "ESCALATE" → decides to escalate; "INVALID" → text that isn't
  JSON; "LEARN" → answers and learns facts (one profile, one raw, one secret); "RECENT" → answers and keeps a
  short-term fact; otherwise it answers. An untitled conversation gets a title; after a pause, "NEWTOPIC" →
  `thread: new`, otherwise `thread: continue`. The answer echoes how many turns the conversation block had.
- Conversation summary (json, `<turns_to_fold>`): a title and a summary naming how many turns were folded.
- Quiz (json): `<quiz_generate count="N" type="T">` → N questions from the request's first topic;
  `<quiz_grade>` → "correct" if the user's answer contains "rate", otherwise "wrong".
- Tier 3 (stream-json): writes a file in output/ and ends; "SLOW" → stalls for 30 s;
  "FAIL" → ends with an error.
"""

import json
import os
import re
import sys
import time
import uuid
from pathlib import Path


SLOW_STREAM = os.environ.get("FAKE_CLAUDE_SLOW") == "1"  # pauses to demo the live stream


def emit(obj: dict) -> None:
    if SLOW_STREAM:
        time.sleep(0.8)
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def result(data: dict, session_id: str, usage: dict, structured: bool = True, **extra) -> None:
    emit({"type": "result", "subtype": "success", "is_error": False, "result": json.dumps(data, ensure_ascii=False),
          **({"structured_output": data} if structured else {}), "session_id": session_id, "duration_ms": 800,
          "total_cost_usd": 0.001, "usage": usage, "modelUsage": {"claude-haiku-4-5": {}}, **extra})


def main() -> None:
    args = sys.argv[1:]
    prompt = sys.stdin.read()
    fmt = args[args.index("--output-format") + 1]
    session_id = str(uuid.uuid4())
    if "--resume" in args:
        session_id = args[args.index("--resume") + 1]
    usage = {"input_tokens": 100, "cache_read_input_tokens": 50, "output_tokens": 20}

    if fmt == "json":
        request = prompt.split("<request>")[-1]
        extra = {}
        if 'untitled="true"' in prompt:
            extra["title"] = "Fake title"
        if "paused_minutes=" in prompt:
            extra["thread"] = "new" if "NEWTOPIC" in request else "continue"
        conversation = prompt.split("<conversation ")[1].split("</conversation>")[0] if "<conversation " in prompt else ""
        turns = conversation.count("User: ")
        if "<turns_to_fold>" in prompt:
            folded = prompt.split("<turns_to_fold>")[1].count("] User: ")
            result({"title": "Folded conversation", "summary": f"## Topic\nFolded {folded} turns."}, session_id, usage)
        elif m := re.search(r'<quiz_generate count="(\d+)" type="(\w+)">', prompt):
            n, kind = int(m.group(1)), m.group(2)
            topic = re.search(r'<topic path="([^"]+)"', prompt).group(1)
            questions = [{"question": f"Question {i + 1}?", "answer": "The rate of change.", "explanation": "Because.",
                          "topic": topic, **({"options": ["A", "B", "C", "D"], "correct": i % 4} if kind == "multiple" else {})}
                         for i in range(n)]
            questions.append({"question": "no answer"})  # invalid: the Bridge drops it
            result({"questions": questions}, session_id, usage, duration_ms=900, total_cost_usd=0.002)
        elif "<quiz_grade>" in prompt:
            user = prompt.split("<user_answer>")[1]
            correct = "rate" in user
            result({"verdict": "correct" if correct else "wrong", "comment": "Nice!" if correct else "That's not it.",
                    "detail": "The derivative is the instantaneous rate of change."}, session_id, usage, duration_ms=500)
        elif "ESCALATE" in request:
            result({"action": "escalate", "reason": "This needs work in the memory.", "task": "Organize raw/ (ESCALATED)", "skill": None},
                   session_id, usage, duration_ms=900, total_cost_usd=0.0012)
        elif "RESEARCH" in request:
            result({"action": "research", "topic": "Moving to Canada", "kind": "research",
                    "query": "Research visas, cost of living and work to live in Canada.", "update": None}, session_id, usage)
        elif "CAPTURE" in request:
            result({"action": "capture", "items": [
                {"type": "event", "title": "Arthur's birthday (brother)", "date": "2026-10-03", "all_day": True, "repeat": "yearly"},
                {"type": "task", "text": "Buy a present", "due": "2026-10-09"},
                {"type": "reminder", "text": "Call Arthur", "when": "2026-10-03T18:00"},
                {"type": "reminder", "text": "Take medicine", "time": "22:00", "weekdays": []},
            ]}, session_id, usage)
        elif "RECENT" in request:
            result({"action": "answer", "reply": "Happy hunting!", "learn": [
                {"fact": "Looking for a birthday present for their mother", "where": "recent", "days": 4},
            ], **extra}, session_id, usage)
        elif "LEARN" in request:
            result({"action": "answer", "reply": "Good luck with the exam!", "learn": [
                {"fact": "Is preparing for the AWS exam, planned for 2026-12-05", "where": "profile",
                 "replaces": "Is preparing for the Azure exam"},
                {"fact": "The Atlas project uses Postgres and runs on Fly.io", "where": "raw"},
                {"fact": "Bank password is hunter2", "where": "profile"},
            ]}, session_id, usage)
        elif "INVALID" in request:
            emit({"type": "result", "subtype": "success", "is_error": False, "result": "Hello! I don't speak JSON.",
                  "session_id": session_id, "duration_ms": 500, "total_cost_usd": 0.001, "usage": usage})
        else:
            data = {"action": "answer", "reply": "A derivative is the instantaneous rate of change."
                    + (f" (I saw {turns} earlier turns.)" if turns else ""), **extra}
            # No structured_output: the Bridge must pull the JSON out of the text (including a ```json block).
            emit({"type": "result", "subtype": "success", "is_error": False,
                  "result": "```json\n" + json.dumps(data, ensure_ascii=False) + "\n```",
                  "session_id": session_id, "duration_ms": 700, "total_cost_usd": 0.0011, "usage": usage,
                  "modelUsage": {"claude-haiku-4-5": {}}})
        return

    # stream-json (Tier 3)
    emit({"type": "system", "subtype": "init", "session_id": session_id, "model": "claude-sonnet-5-5", "cwd": str(Path.cwd())})
    if "SLOW" in prompt:
        time.sleep(30)
    if "SPACE" in prompt or "<space_errors>" in prompt:
        # A page: broken on the first try (a kanban without group_by), fixed when the errors come back.
        page = Path.cwd() / "spaces" / "demo" / "space.yaml"
        fixed = "<space_errors>" in prompt
        content = "name: Demo\ncollection: {view: " + ("list" if fixed else "kanban") + "}\nitem:\n  - {block: markdown, section: Notes}\n"
        emit({"type": "assistant", "message": {"content": [
            {"type": "tool_use", "id": "t0", "name": "Write", "input": {"file_path": str(page), "content": content}},
        ]}})
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(content, encoding="utf-8")
        emit({"type": "result", "subtype": "success", "is_error": False, "result": "Page ready.",
              "session_id": session_id, "duration_ms": 900, "total_cost_usd": 0.01, "usage": usage})
        return
    target = Path.cwd() / "output" / "test-report.md"
    emit({"type": "assistant", "message": {"content": [
        {"type": "text", "text": "I'll write the report."},
        {"type": "tool_use", "id": "t1", "name": "Write", "input": {"file_path": str(target), "content": "# Report"}},
    ]}})
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"# Report\n\nRequest: {prompt.strip()}\n", encoding="utf-8")
    sys.stdout.write("a line that is not json\n")
    sys.stdout.flush()
    if "FAIL" in prompt:
        emit({"type": "result", "subtype": "error_during_execution", "is_error": True, "result": "",
              "session_id": session_id, "duration_ms": 300, "total_cost_usd": 0.002, "usage": usage})
        sys.exit(1)
    emit({"type": "result", "subtype": "success", "is_error": False, "result": "Done: I wrote output/test-report.md.",
          "session_id": session_id, "duration_ms": 1500, "total_cost_usd": 0.02, "usage": usage,
          "modelUsage": {"claude-sonnet-5-5": {}}})


if __name__ == "__main__":
    main()
