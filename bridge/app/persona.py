"""The assistant's identity (name, look) and the first-run setup.

The identity lives in the memory (`agent.json`), next to the user's notes: it is theirs, like the rest. Until the
setup is done, the assistant is the default (Gandalf, the grey wizard). The user's name and what they wrote about
themselves go to `wiki/about-me/profile.md`, which every request already reads.
"""

import json
import re
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

from app.config import get_settings
from app.memory.reader import read_text

AGENT_FILE = "agent.json"
PROFILE = Path("wiki") / "about-me" / "profile.md"
ABOUT_HEADING = "## In my own words"
ABOUT_LIMIT = 3000

GENDERS = ("male", "female")
# The parts of the drawing the user can color (the HUD draws the wizard; the Bridge only keeps the choices).
AVATAR_PARTS = ("hat", "robe", "hair", "skin", "gem")
DEFAULT_AVATAR = {"hat": "#8c8a80", "robe": "#8c8a80", "hair": "#f7f0e0", "skin": "#e9c9a1", "gem": "#e0a42a"}
_COLOR = re.compile(r"#[0-9a-fA-F]{6}")


@dataclass(frozen=True)
class Agent:
    name: str = "Gandalf"
    gender: str = "male"
    avatar: dict = field(default_factory=lambda: dict(DEFAULT_AVATAR))
    setup_done: str | None = None

    @property
    def kind(self) -> str:
        """How the persona describes itself in the prompts."""
        return "witch" if self.gender == "female" else "wizard"


_cache: dict = {"key": None, "agent": None}
_lock = threading.Lock()


def _path(memory: Path) -> Path:
    return memory / AGENT_FILE


def load(memory: Path) -> Agent:
    """The saved identity (or the default). Cached by the file's mtime: the prompts read it on every request."""
    path = _path(memory)
    try:
        key = (str(path), path.stat().st_mtime_ns)
    except OSError:
        return Agent()
    with _lock:
        if _cache["key"] == key:
            return _cache["agent"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        agent = Agent(
            name=_clean_name(data.get("name")) or Agent.name,
            gender=data.get("gender") if data.get("gender") in GENDERS else Agent.gender,
            avatar=_clean_avatar(data.get("avatar")),
            setup_done=data.get("setup_done") or None,
        )
    except (OSError, ValueError, AttributeError):
        agent = Agent()
    with _lock:
        _cache.update(key=key, agent=agent)
    return agent


def current() -> Agent:
    return load(get_settings().memory_path)


def _clean_name(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:40]


def _clean_avatar(value) -> dict:
    value = value if isinstance(value, dict) else {}
    return {k: v if isinstance(v := value.get(k), str) and _COLOR.fullmatch(v) else DEFAULT_AVATAR[k] for k in AVATAR_PARTS}


def _write(memory: Path, agent: Agent) -> None:
    path = _path(memory)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(asdict(agent), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def save_agent(memory: Path, name: str, gender: str, avatar: dict) -> Agent:
    name = _clean_name(name)
    if not name:
        raise ValueError("the assistant needs a name")
    if gender not in GENDERS:
        raise ValueError(f"gender must be one of {GENDERS}")
    agent = Agent(name=name, gender=gender, avatar=_clean_avatar(avatar), setup_done=load(memory).setup_done)
    _write(memory, agent)
    return agent


def finish(memory: Path, now: datetime) -> Agent:
    agent = load(memory)
    agent = Agent(agent.name, agent.gender, agent.avatar, setup_done=now.isoformat(timespec="seconds"))
    _write(memory, agent)
    return agent


# ---------- the user (wiki/about-me/profile.md) ----------

_NAME_LINE = re.compile(r"^- Name:[ \t]*(.*)$", re.MULTILINE)

_ABOUT = re.compile(rf"^{re.escape(ABOUT_HEADING)}[ \t]*\n(?P<body>.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL)


def user(memory: Path) -> dict:
    text = read_text(memory / PROFILE)
    m = _NAME_LINE.search(text)
    name = m.group(1).strip() if m else ""
    about = _ABOUT.search(text)
    return {"name": "" if name.startswith("_") else name, "about": about.group("body").strip() if about else ""}


def save_user(memory: Path, name: str, about: str) -> dict:
    """Writes the name (a `- Name:` line) and the free text (its own section) into the profile, keeping the rest."""
    name = _clean_name(name)
    if not name:
        raise ValueError("your name is required")
    about = about.strip()[:ABOUT_LIMIT]
    path = memory / PROFILE
    text = read_text(path) or "# Profile\n"
    if _NAME_LINE.search(text):
        text = _NAME_LINE.sub(lambda _: f"- Name: {name}", text, count=1)
    elif m := re.search(r"^- ", text, re.MULTILINE):
        # before the first item of the list
        text = f"{text[:m.start()]}- Name: {name}\n{text[m.start():]}"
    else:
        text = text.rstrip() + f"\n\n- Name: {name}\n"
    block = f"{ABOUT_HEADING}\n\n{about}\n\n" if about else ""
    if _ABOUT.search(text):
        text = _ABOUT.sub(lambda _: block, text, count=1)
    elif block:
        text = text.rstrip() + "\n\n" + block
    text = text.rstrip() + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return user(memory)


# ---------- prompts ----------

def render(text: str, agent: Agent | None = None) -> str:
    """Fills the identity into a prompt: {{name}} and {{kind}} (wizard/witch)."""
    agent = agent or current()
    return text.replace("{{name}}", agent.name).replace("{{kind}}", agent.kind)


def identity_instruction(agent: Agent | None = None) -> str:
    """For Tier 3 (the memory's CLAUDE.md may still call the assistant Gandalf)."""
    agent = agent or current()
    pronoun = "she/her" if agent.gender == "female" else "he/him"
    return (
        f"Your name is {agent.name} ({pronoun}), the name the user chose for you: an old, wise and warm {agent.kind}. "
        f"If a file in the memory calls the assistant by another name (such as Gandalf), that means you, {agent.name}."
    )


# ---------- Google connectors (claude.ai), as Claude Code sees them ----------

_MCP_LINE = re.compile(r"^(?P<name>.+?): (?P<target>\S.*?) - (?P<status>.+)$")


def parse_mcp_list(output: str) -> list[dict]:
    """`claude mcp list` → [{name, connected}]. Lines look like `claude.ai Gmail: https://… - ✔ Connected`."""
    servers = []
    for line in output.splitlines():
        m = _MCP_LINE.match(line.strip())
        if m:
            status = m.group("status")
            servers.append({"name": m.group("name").strip(), "connected": "Connected" in status and "✗" not in status})
    return servers


CONNECTORS = {"gmail": ("gmail",), "calendar": ("calendar",)}


def google_connectors(servers: list[dict]) -> dict:
    """{gmail: {found, connected, name}, calendar: {...}} from the server list."""
    out = {}
    for key, words in CONNECTORS.items():
        match = next((s for s in servers if any(w in s["name"].lower() for w in words)), None)
        out[key] = {"found": match is not None, "connected": bool(match and match["connected"]), "name": match["name"] if match else None}
    return out
