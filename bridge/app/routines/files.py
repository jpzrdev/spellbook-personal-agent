"""Creating, editing and removing routine notes in life/routines/ (frontmatter + description)."""

from pathlib import Path

import frontmatter
import yaml

from app import clock, cron
from app.routines.actions import ACTIONS
from app.vault.reader import ROUTINES, read_text
from app.vault.writer import slugify, write_atomic


class InvalidRoutine(ValueError):
    pass


class RoutineExists(Exception):
    pass


class RoutineNotFound(Exception):
    pass


ORDER = ["type", "name", "cron", "active", "tier", "skill", "action", "output", "notify", "created"]


class _Quoted(str):
    """A string YAML writes in quotes (the cron stays readable and never turns into another type)."""


yaml.SafeDumper.add_representer(_Quoted, lambda d, v: d.represent_scalar("tag:yaml.org,2002:str", v, style='"'))


def path_for(vault: Path, slug: str) -> Path:
    if slugify(slug) != slug:
        raise RoutineNotFound(slug)
    return vault / ROUTINES / f"{slug}.md"


def validate(meta: dict, tz) -> None:
    try:
        cron.create_trigger(str(meta.get("cron", "")), tz)
    except (ValueError, TypeError) as e:
        raise InvalidRoutine(f"invalid schedule (cron): {meta.get('cron')!r}") from e
    if meta.get("output") not in (None, "vault", "ephemeral"):
        raise InvalidRoutine("output must be 'vault' or 'ephemeral'")
    tier = meta.get("tier")
    if tier == 1:
        if meta.get("action") not in ACTIONS:
            raise InvalidRoutine(f"an internal routine needs a valid action: {', '.join(ACTIONS)}")
    elif tier == 3:
        pass  # skill is optional: without one, the description becomes Claude Code's task
    else:
        raise InvalidRoutine("tier must be 1 (internal action) or 3 (Claude Code)")


def _write(path: Path, meta: dict, description: str) -> None:
    meta = {k: meta[k] for k in ORDER if meta.get(k) is not None} | {
        k: v for k, v in meta.items() if k not in ORDER and v is not None
    }
    if meta.get("cron") is not None:
        meta["cron"] = _Quoted(meta["cron"])
    header = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)
    write_atomic(path, f"---\n{header}---\n{description.strip()}\n")


def create(vault: Path, tz, *, name: str, cron_expr: str, tier: int, active: bool,
           skill: str | None, action: str | None, description: str, output: str = "vault", notify: bool = False) -> str:
    slug = slugify(name)
    path = path_for(vault, slug)
    if path.exists():
        raise RoutineExists(slug)
    meta = {"type": "routine", "name": name.strip(), "cron": cron_expr.strip(), "active": active, "tier": tier,
            "skill": skill or None, "action": action or None,
            # "vault" is the default: the field is only written when the output is ephemeral.
            "output": "ephemeral" if output == "ephemeral" else None,
            "notify": True if notify else None,
            # Creation date: late routines don't recover times before it.
            "created": clock.now().isoformat(timespec="seconds")}
    validate(meta, tz)
    _write(path, meta, description)
    return slug


def update(vault: Path, tz, slug: str, changes: dict, description: str | None = None) -> None:
    """Changes only the given fields; keeps unknown fields and the note body."""
    path = path_for(vault, slug)
    if not path.is_file():
        raise RoutineNotFound(slug)
    post = frontmatter.loads(read_text(path))
    meta = dict(post.metadata)
    for key, value in changes.items():
        if key == "cron_expr":
            key = "cron"
        if (key == "output" and value == "vault") or (key == "notify" and not value):
            value = None  # defaults are not written
        meta[key] = value if value != "" else None
    validate(meta, tz)
    _write(path, meta, description if description is not None else post.content)


def remove(vault: Path, slug: str) -> None:
    path = path_for(vault, slug)
    if not path.is_file():
        raise RoutineNotFound(slug)
    path.unlink()
