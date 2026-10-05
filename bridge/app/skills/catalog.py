"""Catalog of the vault's Claude Code skills (vault/.claude/skills/<name>/SKILL.md)."""

import re
from dataclasses import dataclass, field
from pathlib import Path

import frontmatter

SKILLS = Path(".claude/skills")
OUTPUTS = ("ephemeral", "research", "library")


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


def _tools(value) -> list[str]:
    """`allowed-tools` can be a list or text separated by commas/spaces (Claude Code format)."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(i).strip() for i in value if str(i).strip()]
    # Split on commas/spaces without breaking what is inside parentheses: "Bash(git *)".
    return re.findall(r"[^,\s(]+(?:\([^)]*\))?", str(value))


def get_skill(vault: Path, name: str) -> Skill | None:
    return next((s for s in list_skills(vault) if s.name == name), None)


def has_skill(vault: Path, name: str) -> bool:
    return get_skill(vault, name) is not None


def list_skills(vault: Path) -> list[Skill]:
    folder = vault / SKILLS
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
