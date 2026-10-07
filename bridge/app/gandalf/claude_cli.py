"""Running the Claude Code CLI (`claude -p`) as a subprocess.

- The request goes through stdin (avoids command-line length limits and quoting issues on Windows).
- On Windows we prefer the native `claude.exe` over npm's `claude.cmd` (which goes through cmd.exe).
- Everything is synchronous and runs in threads: uvicorn's asyncio loop with reload on Windows does
  not support subprocesses, so Tier 3 reads stdout in a thread and forwards the events.
"""

import json
import os
import shutil
import signal
import subprocess
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings


class ClaudeUnavailable(Exception):
    """CLI not found or not logged in."""


class ClaudeFailed(Exception):
    pass


def resolve_command() -> list[str]:
    """Command prefix. `CLAUDE_BIN` (optional) is the path to the executable."""
    configured = get_settings().claude_bin.strip().strip('"')
    if configured:
        # A .py runs with the Bridge's Python (e.g. the tests' fake CLI, for demos).
        # A relative path is resolved from the Bridge directory (the subprocess runs inside the memory).
        path = str(Path(configured).resolve()) if ("/" in configured or "\\" in configured) else configured
        return [sys.executable, path] if path.endswith(".py") else [path]
    path = shutil.which("claude")
    if not path:
        raise ClaudeUnavailable(
            "Claude Code not found. Install it with `npm install -g @anthropic-ai/claude-code` "
            "and log in with `claude auth login`."
        )
    if path.lower().endswith((".cmd", ".ps1")):
        exe = Path(path).parent / "node_modules" / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe"
        if exe.is_file():
            return [str(exe)]
    return [path]


def _environment() -> dict[str, str]:
    env = os.environ.copy()
    # Don't let an API key in the environment divert usage away from the user's subscription.
    env.pop("ANTHROPIC_API_KEY", None)
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def _creation_flags() -> dict:
    if os.name == "nt":
        # Own process group so the process tree can be terminated; no console window.
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW}
    return {"start_new_session": True}


def terminate(proc: subprocess.Popen) -> None:
    """Kills the process and its children (the CLI may spawn subprocesses for tools)."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    else:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


@dataclass
class JsonResult:
    """Output of `--output-format json`."""

    text: str
    structured: dict | None
    error: bool
    session_id: str | None
    duration_ms: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    model: str | None
    raw: dict


def _tokens(usage: dict | None) -> tuple[int, int]:
    usage = usage or {}
    input_tokens = (
        int(usage.get("input_tokens") or 0)
        + int(usage.get("cache_creation_input_tokens") or 0)
        + int(usage.get("cache_read_input_tokens") or 0)
    )
    return input_tokens, int(usage.get("output_tokens") or 0)


def _model(data: dict) -> str | None:
    usage = data.get("modelUsage")
    if isinstance(usage, dict) and usage:
        return next(iter(usage))
    return data.get("model")


def parse_result(data: dict) -> JsonResult:
    input_tokens, output_tokens = _tokens(data.get("usage"))
    structured = data.get("structured_output")
    return JsonResult(
        text=str(data.get("result") or ""),
        structured=structured if isinstance(structured, dict) else None,
        error=bool(data.get("is_error")) or data.get("subtype") not in (None, "success"),
        session_id=data.get("session_id"),
        duration_ms=int(data.get("duration_ms") or 0),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=float(data.get("total_cost_usd") or 0.0),
        model=_model(data),
        raw=data,
    )


def run_json(prompt: str, args: list[str], cwd: Path, timeout_s: float = 120) -> JsonResult:
    """One short, blocking call (Tier 2). Raises ClaudeFailed on error."""
    cmd = resolve_command() + ["-p", "--output-format", "json", *args]
    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=cwd,
            env=_environment(),
            timeout=timeout_s,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except FileNotFoundError as e:
        raise ClaudeUnavailable(str(e)) from e
    except subprocess.TimeoutExpired as e:
        raise ClaudeFailed(f"Claude Code did not answer within {timeout_s:.0f}s") from e

    out = proc.stdout.strip()
    try:
        data = json.loads(out.splitlines()[-1]) if out else None
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, dict):
        detail = (proc.stderr or out or "no output").strip()[-500:]
        if "login" in detail.lower() or "auth" in detail.lower():
            raise ClaudeUnavailable(f"Claude Code is not logged in. Run `claude auth login`. ({detail})")
        raise ClaudeFailed(f"unexpected output from Claude Code (exit code {proc.returncode}): {detail}")
    result = parse_result(data)
    if result.error and not result.text:
        raise ClaudeFailed(f"Claude Code finished with an error: {data.get('subtype')}")
    return result


def start_stream(prompt: str, args: list[str], cwd: Path) -> subprocess.Popen:
    """Starts a session with `--output-format stream-json` (Tier 3). The caller reads stdout."""
    cmd = resolve_command() + ["-p", "--output-format", "stream-json", "--verbose", *args]
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=cwd,
            env=_environment(),
            bufsize=1,
            **_creation_flags(),
        )
    except FileNotFoundError as e:
        raise ClaudeUnavailable(str(e)) from e
    assert proc.stdin is not None
    proc.stdin.write(prompt)
    proc.stdin.close()
    return proc


def read_events(proc: subprocess.Popen, on_invalid_line: Callable[[str], None] | None = None) -> Iterator[dict]:
    """Yields the JSON events (one per line) from stdout until the process ends."""
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            if on_invalid_line:
                on_invalid_line(line)
            continue
        if isinstance(event, dict):
            yield event


def login_status() -> dict:
    """`claude auth status` as JSON (used by /health)."""
    try:
        cmd = resolve_command() + ["auth", "status"]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
            env=_environment(),
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        data = json.loads(proc.stdout or "{}")
        return {"installed": True, "logged_in": bool(data.get("loggedIn")), "method": data.get("authMethod")}
    except ClaudeUnavailable:
        return {"installed": False, "logged_in": False, "method": None}
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return {"installed": True, "logged_in": False, "method": None}
