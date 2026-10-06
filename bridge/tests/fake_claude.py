"""Fake Claude Code for tests: imitates `claude -p --output-format json|stream-json`.

The behavior comes from the request text (stdin):
- Tier 2 (json): "ESCALATE" → decides to escalate; "INVALID" → text that isn't JSON; otherwise it answers.
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
        if m := re.search(r'<quiz_generate count="(\d+)" type="(\w+)">', prompt):
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
        elif "ESCALATE" in prompt:
            result({"action": "escalate", "reason": "This needs work in the vault.", "task": "Organize raw/ (ESCALATED)", "skill": None},
                   session_id, usage, duration_ms=900, total_cost_usd=0.0012)
        elif "RESEARCH" in prompt:
            result({"action": "research", "topic": "Moving to Canada", "kind": "research",
                    "query": "Research visas, cost of living and work to live in Canada.", "update": None}, session_id, usage)
        elif "CAPTURE" in prompt:
            result({"action": "capture", "items": [
                {"type": "event", "title": "Arthur's birthday (brother)", "date": "2026-10-03", "all_day": True, "repeat": "yearly"},
                {"type": "task", "text": "Buy a present", "due": "2026-10-09"},
                {"type": "reminder", "text": "Call Arthur", "when": "2026-10-03T18:00"},
                {"type": "reminder", "text": "Take medicine", "time": "22:00", "weekdays": []},
            ]}, session_id, usage)
        elif "INVALID" in prompt:
            emit({"type": "result", "subtype": "success", "is_error": False, "result": "Hello! I don't speak JSON.",
                  "session_id": session_id, "duration_ms": 500, "total_cost_usd": 0.001, "usage": usage})
        else:
            data = {"action": "answer", "reply": "A derivative is the instantaneous rate of change."}
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
