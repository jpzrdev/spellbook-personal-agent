"""Pages (spaces): `spaces/<slug>/space.yaml` says how to show the folder; each item is a markdown note beside it.

The note stays plain markdown: properties in the frontmatter, and the body split in `## Section` headings that
the page's blocks point at (a checklist, steps, a gallery…). The HUD is only a lens over these files.
"""

import re
from datetime import date, datetime
from pathlib import Path

import frontmatter
import yaml
from pydantic import ValidationError

from app.memory import edit
from app.memory.writer import slugify, write_atomic
from app.spaces.schema import FieldDef, Space, errors

SPACES = Path("spaces")
TEMPLATES = Path(__file__).parent / "templates"
CONFIG = "space.yaml"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")
LIST_ITEM = re.compile(r"^(\s*)(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?")


class InvalidSpace(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def _folder(memory: Path, slug: str) -> Path:
    if not SLUG.fullmatch(slug):
        raise FileNotFoundError(slug)
    return memory / SPACES / slug


def _item_path(memory: Path, slug: str, item: str) -> Path:
    if not SLUG.fullmatch(item):
        raise FileNotFoundError(item)
    path = _folder(memory, slug) / f"{item}.md"
    if not path.is_file():
        raise FileNotFoundError(item)
    return path


# ---------- the page ----------

def parse(data) -> Space:
    """Validates a page's config (dict). Raises InvalidSpace with one line per problem."""
    if not isinstance(data, dict):
        raise InvalidSpace(["space.yaml must be a mapping (name:, fields:, collection:, item:…)"])
    try:
        return Space.model_validate(data)
    except ValidationError as e:
        raise InvalidSpace(errors(e)) from e


def load(memory: Path, slug: str) -> Space:
    path = _folder(memory, slug) / CONFIG
    if not path.is_file():
        raise FileNotFoundError(slug)
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise InvalidSpace([f"invalid YAML: {e}"]) from e
    return parse(data)


def problems(memory: Path, slug: str) -> list[str]:
    try:
        load(memory, slug)
        return []
    except InvalidSpace as e:
        return e.problems


def _dump(space: Space) -> str:
    data = space.model_dump(mode="json", exclude_defaults=True)
    return yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=120)


def save(memory: Path, slug: str, data: dict) -> Space:
    space = parse(data)
    folder = _folder(memory, slug)
    folder.mkdir(parents=True, exist_ok=True)
    write_atomic(folder / CONFIG, _dump(space))
    return space


def _summary(memory: Path, folder: Path) -> dict:
    slug = folder.name
    base = {"slug": slug, "count": len(list(_item_files(folder)))}
    try:
        s = load(memory, slug)
        return {**base, "name": s.name, "icon": s.icon, "color": s.color, "description": s.description,
                "draft": s.draft, "errors": []}
    except InvalidSpace as e:
        return {**base, "name": slug.replace("-", " ").capitalize(), "icon": "sparkles", "color": "ember",
                "description": "", "draft": True, "errors": e.problems}


def list_spaces(memory: Path) -> list[dict]:
    root = memory / SPACES
    if not root.is_dir():
        return []
    folders = [p for p in sorted(root.iterdir()) if p.is_dir() and (p / CONFIG).is_file() and SLUG.fullmatch(p.name)]
    return [_summary(memory, p) for p in folders]


def remove(memory: Path, slug: str, now: datetime) -> str:
    """Removes the page (its space.yaml goes to the trash); the items stay in the memory as notes."""
    folder = _folder(memory, slug)
    if not (folder / CONFIG).is_file():
        raise FileNotFoundError(slug)
    return edit.delete(memory, (SPACES / slug / CONFIG).as_posix(), now)


# ---------- templates (the modules' pages) ----------

GUIDE = "guide.md"  # in a template: how the page works; copied beside the page as `_guide.md` (Gandalf reads it)


def _template(template: str) -> Path:
    folder = TEMPLATES / template
    if not SLUG.fullmatch(template) or not (folder / CONFIG).is_file():
        raise FileNotFoundError(template)
    return folder


def template(template_id: str) -> dict:
    """A ready-made page: its config, sample items (for the preview) and its guide."""
    folder = _template(template_id)
    space = parse(yaml.safe_load((folder / CONFIG).read_text(encoding="utf-8")))
    samples = [{**_read_item(space, p, full=True), "path": None} for p in _item_files(folder) if p.name != GUIDE]
    guide = folder / GUIDE
    return {"id": template_id, "config": space.model_dump(mode="json"), "samples": samples,
            "guide": guide.read_text(encoding="utf-8") if guide.is_file() else ""}


def ensure_page(memory: Path, template_id: str) -> str:
    """The module's page at spaces/<id>/ (created from the template once; the user's changes are kept) and its
    guide, refreshed from the template so Gandalf always reads the current one."""
    folder = _template(template_id)
    target = memory / SPACES / template_id
    if not (target / CONFIG).is_file():
        data = yaml.safe_load((folder / CONFIG).read_text(encoding="utf-8"))
        save(memory, template_id, {**data, "template": template_id, "draft": False})
    guide = folder / GUIDE
    if guide.is_file():
        text = guide.read_text(encoding="utf-8")
        current = target / "_guide.md"
        if not current.is_file() or current.read_text(encoding="utf-8") != text:
            write_atomic(current, text)
    return template_id


def guide(memory: Path, slug: str) -> str:
    path = _folder(memory, slug) / "_guide.md"
    return path.read_text(encoding="utf-8") if path.is_file() else ""


# ---------- items ----------

def _item_files(folder: Path):
    return sorted(p for p in folder.glob("*.md") if not p.name.startswith(("_", ".")))


def sections(body: str) -> tuple[str, dict[str, str]]:
    """The body's text before the first `## ` (the intro) and each `## Section` by name."""
    intro, found, current, lines = [], {}, None, []
    for line in body.splitlines():
        if m := re.match(r"^##\s+(.+?)\s*#*\s*$", line):
            if current is not None:
                found[current] = "\n".join(lines).strip()
            current, lines = m.group(1).strip(), []
        elif current is None:
            intro.append(line)
        else:
            lines.append(line)
    if current is not None:
        found[current] = "\n".join(lines).strip()
    text = "\n".join(intro).strip()
    text = re.sub(r"^#\s+.+$", "", text, count=1, flags=re.M).strip()  # the title is shown apart
    return text, found


def _title(post, path: Path) -> str:
    if post.metadata.get("title"):
        return str(post.metadata["title"])
    if m := re.search(r"^#\s+(.+)$", post.content, re.M):
        return m.group(1).strip()
    return path.stem.replace("-", " ").capitalize()


def _value(f: FieldDef, raw):
    """A frontmatter value as the field's type (or None when it doesn't fit: the HUD shows it empty)."""
    if raw is None or raw == "":
        return None
    try:
        match f.type:
            case "number" | "rating" | "duration" | "progress":
                if isinstance(raw, bool):
                    return None
                n = float(raw)
                return int(n) if n.is_integer() else n
            case "bool":
                return raw if isinstance(raw, bool) else str(raw).lower() in ("true", "yes", "1", "sim")
            case "tags":
                items = raw if isinstance(raw, list) else re.split(r"\s*,\s*", str(raw))
                return [str(x).strip() for x in items if str(x).strip()]
            case "date":
                return raw.isoformat()[:10] if isinstance(raw, (date, datetime)) else str(raw)[:10]
            case "select":
                return str(raw)
            case _:
                return str(raw)
    except (TypeError, ValueError):
        return None


def _read_item(space: Space, path: Path, full: bool) -> dict:
    post = frontmatter.load(path)
    intro, parts = sections(post.content)
    item = {
        "id": path.stem,
        "title": _title(post, path),
        "fields": {f.key: _value(f, post.metadata.get(f.key)) for f in space.fields},
        "summary": " ".join(intro.split())[:200],
        "updated": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
    }
    if full:
        item["intro"] = intro
        item["sections"] = parts
        item["path"] = path.as_posix()
    return item


def detail(memory: Path, slug: str) -> dict:
    """The page: its config (or the problems that keep it from loading) and its items."""
    folder = _folder(memory, slug)
    if not (folder / CONFIG).is_file():
        raise FileNotFoundError(slug)
    try:
        space = load(memory, slug)
    except InvalidSpace as e:
        return {"slug": slug, "config": None, "errors": e.problems, "items": [], "guide": guide(memory, slug)}
    items = []
    for path in _item_files(folder):
        try:
            items.append(_read_item(space, path, full=False))
        except Exception:
            continue  # a broken note doesn't take the page down (the Memory tab shows it)
    return {"slug": slug, "config": space.model_dump(mode="json"), "errors": [], "items": items, "guide": guide(memory, slug)}


def item(memory: Path, slug: str, item_id: str) -> dict:
    space = load(memory, slug)
    path = _item_path(memory, slug, item_id)
    data = _read_item(space, path, full=True)
    data["path"] = path.relative_to(memory).as_posix()
    return data


def _coerce(f: FieldDef, value):
    """A value coming from the HUD, checked against the field (ValueError when it doesn't fit)."""
    if value is None or value == "" or value == []:
        return None
    v = _value(f, value)
    if v is None:
        raise ValueError(f"`{f.key}` expects {f.type}")
    if f.type == "select" and v not in [o.value for o in f.options]:
        raise ValueError(f"`{f.key}`: unknown option {v}")
    if f.type == "rating" and not 0 <= v <= (f.max or 5):
        raise ValueError(f"`{f.key}`: from 0 to {int(f.max or 5)}")
    if f.type == "date":
        date.fromisoformat(v)
    return v


def set_fields(memory: Path, slug: str, item_id: str, values: dict) -> dict:
    space = load(memory, slug)
    path = _item_path(memory, slug, item_id)
    post = frontmatter.load(path)
    for key, raw in values.items():
        if key == "title":
            if str(raw or "").strip():
                post.metadata["title"] = str(raw).strip()[:120]
            continue
        f = space.field(key)
        if not f:
            raise ValueError(f"unknown field `{key}`")
        v = _coerce(f, raw)
        if v is None:
            post.metadata.pop(key, None)
        else:
            post.metadata[key] = v
    write_atomic(path, frontmatter.dumps(post) + "\n")
    return item(memory, slug, item_id)


def toggle(memory: Path, slug: str, item_id: str, section: str, index: int, done: bool) -> dict:
    """Checks/unchecks the n-th list item of a section (a plain `- x` becomes `- [x] x`)."""
    load(memory, slug)
    path = _item_path(memory, slug, item_id)
    post = frontmatter.load(path)
    lines = post.content.splitlines()
    inside, n = False, -1
    for i, line in enumerate(lines):
        if m := re.match(r"^##\s+(.+?)\s*#*\s*$", line):
            inside = m.group(1).strip().lower() == section.strip().lower()
            continue
        if not inside or not (m := LIST_ITEM.match(line)) or m.group(1):
            continue  # nested items don't count (the HUD shows only the top level)
        n += 1
        if n == index:
            rest = line[m.end():]
            marker = re.match(r"^\s*([-*+]|\d+[.)])", line).group(1)
            lines[i] = f"{marker} [{'x' if done else ' '}] {rest}"
            break
    else:
        raise FileNotFoundError(f"{section}#{index}")
    post.content = "\n".join(lines)
    write_atomic(path, frontmatter.dumps(post) + "\n")
    return item(memory, slug, item_id)


def create_item(memory: Path, slug: str, title: str, values: dict) -> str:
    space = load(memory, slug)
    folder = _folder(memory, slug)
    item_id = base = slugify(title, 50) or "item"
    n = 2
    while (folder / f"{item_id}.md").exists():
        item_id, n = f"{base}-{n}", n + 1
    meta = {}
    for key, raw in values.items():
        f = space.field(key)
        if not f:
            raise ValueError(f"unknown field `{key}`")
        if (v := _coerce(f, raw)) is not None:
            meta[key] = v
    body = f"# {title.strip()}\n\n" + "".join(f"## {s}\n\n" for s in space.sections())
    write_atomic(folder / f"{item_id}.md", frontmatter.dumps(frontmatter.Post(body.rstrip() + "\n", **meta)) + "\n")
    return item_id


def _section_bounds(lines: list[str], name: str) -> tuple[int, int] | None:
    """[start, end) of a `## name` section's body (case-insensitive), or None."""
    start = None
    for i, line in enumerate(lines):
        if m := re.match(r"^##\s+(.+?)\s*#*\s*$", line):
            if start is not None:
                return start, i
            if m.group(1).strip().lower() == name.strip().lower():
                start = i + 1
    return (start, len(lines)) if start is not None else None


def _cell(value) -> str:
    return " ".join(str(value if value is not None else "").replace("|", "/").split())[:120]


def add_row(memory: Path, slug: str, item_id: str, section: str, columns: list[str], values: dict, touch: str | None) -> dict:
    """Appends a row to the table of a section (creates the section/table with `columns` when missing). `touch`:
    a date field set to the row's date (its first ISO date) or today."""
    space = load(memory, slug)
    path = _item_path(memory, slug, item_id)
    post = frontmatter.load(path)
    lines = post.content.splitlines()
    bounds = _section_bounds(lines, section)
    if bounds is None:
        lines += ["", f"## {section}"]
        bounds = (len(lines), len(lines))
    start, end = bounds
    header = next((i for i in range(start, end) if lines[i].strip().startswith("|")), None)
    if header is None:
        table = [f"| {' | '.join(columns)} |", f"|{'---|' * len(columns)}"]
        lines[start:start] = table
        header, end = start, end + len(table)
    headers = [c.strip() for c in lines[header].strip().strip("|").split("|")]
    lookup = {k.strip().lower(): v for k, v in values.items()}
    if not any(_cell(lookup.get(h.lower())) for h in headers):
        raise ValueError("the row is empty")
    last = header
    while last + 1 < end and lines[last + 1].strip().startswith("|"):
        last += 1
    lines.insert(last + 1, "| " + " | ".join(_cell(lookup.get(h.lower())) for h in headers) + " |")
    post.content = "\n".join(lines)
    if touch:
        f = space.field(touch)
        if not f or f.type != "date":
            raise ValueError(f"`{touch}` is not a date field")
        found = next((v for v in lookup.values() if re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v or "").strip())), None)
        post.metadata[touch] = str(found).strip() if found else date.today().isoformat()
    write_atomic(path, frontmatter.dumps(post) + "\n")
    return item(memory, slug, item_id)


def open_items(memory: Path, slug: str, item_id: str, section: str) -> list[str]:
    """The unchecked top-level items of a list section (plain `- x` items count as unchecked)."""
    load(memory, slug)
    lines = frontmatter.load(_item_path(memory, slug, item_id)).content.splitlines()
    bounds = _section_bounds(lines, section)
    if bounds is None:
        return []
    out = []
    for line in lines[bounds[0]:bounds[1]]:
        if (m := LIST_ITEM.match(line)) and not m.group(1) and not (m.group(2) or "").lower().startswith("[x"):
            if text := line[m.end():].strip():
                out.append(text)
    return out


def delete_item(memory: Path, slug: str, item_id: str, now: datetime) -> str:
    _item_path(memory, slug, item_id)
    return edit.delete(memory, (SPACES / slug / f"{item_id}.md").as_posix(), now)


def touched(files: list[str]) -> list[str]:
    """The pages whose space.yaml a session wrote (memory-relative paths)."""
    slugs = []
    for f in files:
        if (m := re.fullmatch(r"spaces/([a-z0-9][a-z0-9-]*)/space\.ya?ml", f.replace("\\", "/"))) and m.group(1) not in slugs:
            slugs.append(m.group(1))
    return slugs
