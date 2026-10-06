"""Catalog of Gandalf's skills (skills/<name>/SKILL.md at the repository root).

Skills belong to the project, not to the vault: the native ones (the ones the Bridge and the HUD call by name)
are versioned, and the ones the user or Gandalf create live next to them, outside git (see skills/.gitignore).

Tier 3 loads them as a Claude Code plugin, so Claude Code sees every skill and picks the one that fits by itself
(an explicit run calls `/gandalf:<name>`). The plugin is a copy of skills/ (`plugin_dir()`): Claude Code doesn't let
a session edit the skills it has loaded, and Gandalf has to be able to create and edit them in skills/.
"""

import hashlib
import json
import re
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import frontmatter

from app.config import get_settings

OUTPUTS = ("ephemeral", "research", "library")
PLUGIN_NAME = "gandalf"  # the prefix of the skills in Claude Code: /gandalf:<name>
_plugin_lock = threading.Lock()
KEEP_OLD_VERSIONS_S = 24 * 3600  # a running session may still read an older copy (skills load when used)


@dataclass
class Skill:
    name: str
    description: str
    folder: str
    # Extra tools allowed when Tier 3 runs this skill (e.g. MCP: mcp__google_calendar).
    tools: list[str] = field(default_factory=list)
    # `output:` in SKILL.md sets the session mode wherever the skill runs from: ephemeral (read-only,
    # result in the HUD), research (web only, no vault) or library (writes only in wiki/library/).
    output: str = "vault"
    title: str | None = None  # card title in "Today's summaries"

    @property
    def command(self) -> str:
        return f"/{PLUGIN_NAME}:{self.folder}"


def skills_dir() -> Path:
    return get_settings().skills_path


def _tools(value) -> list[str]:
    """`allowed-tools` can be a list or text separated by commas/spaces (Claude Code format)."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(i).strip() for i in value if str(i).strip()]
    # Split on commas/spaces without breaking what is inside parentheses: "Bash(git *)".
    return re.findall(r"[^,\s(]+(?:\([^)]*\))?", str(value))


def get_skill(name: str) -> Skill | None:
    return next((s for s in list_skills() if s.name == name), None)


def has_skill(name: str) -> bool:
    return get_skill(name) is not None


def list_skills() -> list[Skill]:
    folder = skills_dir()
    if not folder.is_dir():
        return []
    skills: list[Skill] = []
    for path in sorted(folder.glob("*/SKILL.md")):
        try:
            meta = frontmatter.load(path).metadata
        except Exception:  # a malformed SKILL.md doesn't break the catalog
            continue
        skills.append(
            Skill(
                name=str(meta.get("name") or path.parent.name),
                description=str(meta.get("description") or "").strip(),
                folder=path.parent.name,
                tools=_tools(meta.get("allowed-tools")),
                output=meta["output"] if meta.get("output") in OUTPUTS else "vault",
                title=str(meta["title"]).strip() if meta.get("title") else None,
            )
        )
    return skills


def _files(folder: Path) -> list[Path]:
    """The skill folders' files (skills/.gitignore and other loose files are not part of the plugin)."""
    return sorted(p for p in folder.glob("*/**/*") if p.is_file())


def plugin_dir() -> Path | None:
    """A Claude Code plugin with a copy of skills/, in bridge/data/plugin/<version>/.

    Each version of skills/ gets its own folder (named after a hash of the contents), so a session that is
    starting never sees a half-written copy. Versions unused for a day are removed."""
    with _plugin_lock:  # sessions start in parallel threads
        return _sync_plugin()


def _sync_plugin() -> Path | None:
    source = skills_dir()
    if not source.is_dir():
        return None
    files = _files(source)
    digest = hashlib.sha1()
    for path in files:
        digest.update(path.relative_to(source).as_posix().encode() + b"\0" + path.read_bytes() + b"\0")
    root = get_settings().data_path / "plugin"
    target = root / digest.hexdigest()[:12]
    if not target.is_dir():
        tmp = root / f".tmp-{uuid.uuid4().hex[:8]}"  # unique: another Bridge process may be copying too
        for path in files:
            dst = tmp / "skills" / path.relative_to(source)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dst)
        manifest = tmp / ".claude-plugin" / "plugin.json"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(json.dumps({
            "name": PLUGIN_NAME,
            "description": "Gandalf's skills (a copy of the project's skills/ folder: edit them there).",
            "version": "1.0.0",
        }, indent=2), encoding="utf-8")
        try:
            tmp.rename(target)
        except OSError:  # another session made the same version at the same time
            shutil.rmtree(tmp, ignore_errors=True)
    now = time.time()
    target.touch()  # in use: the mtime says when it was last handed to a session
    for old in root.iterdir():
        if old.is_dir() and old != target and now - old.stat().st_mtime > KEEP_OLD_VERSIONS_S:
            shutil.rmtree(old, ignore_errors=True)
    return target
