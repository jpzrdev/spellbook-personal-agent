"""Modules: the features the user turns on and off (Studies, Library, Workouts, Recipes, Reading…).

A `screen` module is a screen of the HUD (it only leaves the menu when off). A `page` module is a ready-made page
(bridge/app/spaces/templates/<id>/): turning it on creates `spaces/<id>/` in the memory, with its guide; its skill
(skills/<id>/) tells Claude Code how to keep it. Turning a module off never deletes anything.
"""

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from app.memory.writer import write_atomic
from app.spaces import store

STATE = "modules.json"  # in the memory: {"active": [...]}
GUIDE_LIMIT = 1500  # per module, in the Tier 2 context


@dataclass
class Module:
    id: str
    kind: str  # screen | page
    name: str
    description: str
    icon: str
    color: str
    route: str
    default: bool = False  # on when the user never chose (keeps older memories as they were)
    skills: list[str] = field(default_factory=list)


SCREENS = [
    Module("studies", "screen", "Studies", "Subjects to study: the assistant writes the topics, quizzes you and fits in your material.",
           "graduation-cap", "violet", "/studies", default=True, skills=["prepare-studies", "structure-material"]),
    Module("library", "screen", "Library", "Research and plans you saved (moving abroad, a trip…), organized by topic.",
           "book-marked", "silver", "/library", default=True, skills=["research", "save-research"]),
]
PAGES = ["workouts", "recipes", "reading"]


def catalog() -> list[Module]:
    pages = []
    for pid in PAGES:
        c = store.template(pid)["config"]
        pages.append(Module(pid, "page", c["name"], c["description"], c["icon"], c["color"], f"/p/{pid}", skills=[pid]))
    return [*SCREENS, *pages]


def get(module_id: str) -> Module:
    found = next((m for m in catalog() if m.id == module_id), None)
    if not found:
        raise KeyError(module_id)
    return found


def active(memory: Path) -> set[str]:
    path = memory / STATE
    try:
        ids = json.loads(path.read_text(encoding="utf-8")).get("active")
        if isinstance(ids, list):
            return {str(x) for x in ids}
    except (OSError, ValueError, AttributeError):
        pass
    return {m.id for m in catalog() if m.default}


def list_modules(memory: Path) -> list[dict]:
    on = active(memory)
    out = []
    for m in catalog():
        if m.kind == "page" and m.id in on:
            store.ensure_page(memory, m.id)  # keeps the guide in the memory up to date
        out.append({**asdict(m), "active": m.id in on})
    return out


def set_active(memory: Path, module_id: str, on: bool) -> list[dict]:
    m = get(module_id)
    ids = active(memory)
    if on:
        if m.kind == "page":
            store.ensure_page(memory, m.id)
        ids.add(m.id)
    else:
        ids.discard(m.id)
    order = [x.id for x in catalog()]
    write_atomic(memory / STATE, json.dumps({"active": sorted(ids, key=lambda x: order.index(x) if x in order else 99)}, indent=2) + "\n")
    return list_modules(memory)


def context(memory: Path) -> str:
    """What the Tier 2 model needs to explain and use the modules: which are on, and each page's guide."""
    on = active(memory)
    mods = catalog()
    lines = ["## Modules (features the user turned on; others are off and hidden from the HUD)"]
    for m in mods:
        if m.id not in on:
            continue
        lines.append(f"### {m.name} (on; HUD: {m.route})\n{m.description}")
        if m.kind == "page":
            text = store.guide(memory, m.id).strip()
            if text:
                lines.append(text[:GUIDE_LIMIT] + ("\n…(truncated)" if len(text) > GUIDE_LIMIT else ""))
            lines.append(f"To read or change its data, escalate to Claude Code with the `{m.id}` skill.")
    off = [m.name for m in mods if m.id not in on]
    if off:
        lines.append("Off (the user can turn them on in Modules): " + ", ".join(off) + ".")
    return "\n\n".join(lines)
