"""Links between notes (`[[path/note]]`), full-text search and the memory's mechanical health check.

The health check is the part of the wiki lint that needs no AI (broken links, orphans, notes missing from
their folder's index, wiki notes without frontmatter, raw/ items not compiled yet). The `lint-wiki` skill
gets this report and adds what needs judgment (contradictions, stale claims, gaps).
"""

import re
from dataclasses import dataclass
from pathlib import Path

import frontmatter

from app.memory.browse import HIDDEN, NOTE_SIZE_LIMIT, TEXT_EXTENSIONS

# [[target]], [[target#heading]], [[target|alias]]; ![[embed]] counts too.
WIKILINK = re.compile(r"\[\[([^\[\]|#]+)(#[^\[\]|]*)?(\|[^\[\]]*)?\]\]")
INLINE_CODE = re.compile(r"`[^`]*`")  # examples like `[[path/note]]` aren't links
# Files that only list or log: they don't count as notes for orphans and indexes.
SPECIAL = {"_index.md", "_master-index.md", "_log.md", "_processed.md"}
# Folders left out of links and health: receipts are a log, not knowledge.
SKIP_FOLDERS = {"receipts"}
LIST_LIMIT = 100


@dataclass
class Link:
    source: str  # relative path of the note that has the link
    target: str  # the link as written (without heading/alias)
    resolved: str | None  # relative path of the target note, if it exists
    line: int
    context: str


def note_files(memory: Path, include_receipts: bool = False) -> list[Path]:
    out = []
    for p in memory.rglob("*"):
        rel = p.relative_to(memory)
        if any(part in HIDDEN or part.startswith(".tmp-") for part in rel.parts):
            continue
        if not include_receipts and rel.parts[0] in SKIP_FOLDERS:
            continue
        if p.is_file() and p.suffix.lower() in TEXT_EXTENSIONS:
            out.append(p)
    return sorted(out)


def _read(path: Path) -> str:
    try:
        if path.stat().st_size > NOTE_SIZE_LIMIT:
            return ""
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


class Resolver:
    """Resolves a link target the way the notes are written: a path from the memory root (with or without
    `.md`), or just a note name when it is unique."""

    def __init__(self, memory: Path):
        self.by_path: dict[str, str] = {}
        self.by_name: dict[str, list[str]] = {}
        for p in memory.rglob("*"):
            rel = p.relative_to(memory)
            if not p.is_file() or any(part in HIDDEN for part in rel.parts):
                continue
            key = rel.as_posix()
            self.by_path[key.lower()] = key
            if p.suffix.lower() == ".md":
                self.by_path[key[:-3].lower()] = key
                self.by_name.setdefault(p.stem.lower(), []).append(key)

    def __call__(self, target: str) -> str | None:
        t = target.strip().replace("\\", "/").lstrip("/").lower()
        if t in self.by_path:
            return self.by_path[t]
        if "/" not in t:
            names = self.by_name.get(t.removesuffix(".md"), [])
            return names[0] if len(names) == 1 else None
        return None


def links(memory: Path) -> list[Link]:
    resolve = Resolver(memory)
    out = []
    for path in note_files(memory):
        source = path.relative_to(memory).as_posix()
        in_code = False
        for n, line in enumerate(_read(path).splitlines(), 1):
            if line.lstrip().startswith("```"):
                in_code = not in_code
            if in_code:
                continue
            for m in WIKILINK.finditer(INLINE_CODE.sub("", line)):
                target = m.group(1).strip()
                out.append(Link(source, target, resolve(target), n, line.strip()[:200]))
    return out


def backlinks(memory: Path, path: str) -> list[dict]:
    """Notes that link to `path` (one entry per note, with the first line that links)."""
    seen: dict[str, dict] = {}
    for link in links(memory):
        if link.resolved == path and link.source != path and link.source not in seen:
            seen[link.source] = {"path": link.source, "title": title_of(memory / link.source), "context": link.context}
    return list(seen.values())


def title_of(path: Path) -> str:
    text = _read(path)
    m = re.search(r"^#\s+(.+)$", text, re.M)
    return m.group(1).strip() if m else path.stem


def search(memory: Path, query: str, limit: int = 50) -> list[dict]:
    """Case-insensitive search in names and contents. File-name matches come first."""
    q = query.strip().lower()
    if not q:
        return []
    results = []
    for path in note_files(memory):
        rel = path.relative_to(memory).as_posix()
        text = _read(path)
        lines = [ln.strip() for ln in text.splitlines() if q in ln.lower()]
        in_name = q in rel.lower()
        if not lines and not in_name:
            continue
        results.append({
            "path": rel,
            "title": title_of(path),
            "snippets": [ln[:200] for ln in lines[:3]],
            "matches": len(lines),
            "_rank": (0 if in_name else 1, -len(lines)),
        })
    results.sort(key=lambda r: r["_rank"])
    for r in results:
        del r["_rank"]
    return results[:limit]


def _processed(memory: Path) -> str:
    return _read(memory / "raw" / "_processed.md").lower()


def health(memory: Path) -> dict:
    """The mechanical part of the wiki lint. Each list is capped at LIST_LIMIT; `counts` has the totals."""
    all_links = links(memory)
    broken = [
        {"source": x.source, "target": x.target, "line": x.line}
        for x in all_links
        if x.resolved is None and x.source.split("/")[0] != "raw"  # raw/ is the user's: not our links
    ]
    linked = {x.resolved for x in all_links if x.resolved and x.resolved != x.source}
    links_from: dict[str, set[str]] = {}
    for x in all_links:
        links_from.setdefault(x.source, set()).add(x.resolved)

    wiki = memory / "wiki"
    wiki_notes = [p for p in note_files(memory) if wiki in p.parents and p.suffix == ".md"]
    orphans, unindexed, no_frontmatter = [], [], []
    for p in wiki_notes:
        rel = p.relative_to(memory).as_posix()
        if p.name in SPECIAL:
            continue
        if rel not in linked:
            orphans.append(rel)
        index = p.parent / "_index.md"
        if index.is_file() and rel not in links_from.get(index.relative_to(memory).as_posix(), set()):
            unindexed.append(rel)
        try:
            meta = frontmatter.loads(_read(p)).metadata
        except Exception:
            meta = {}
        if not meta.get("type"):
            no_frontmatter.append(rel)

    processed = _processed(memory)
    raw = memory / "raw"
    pending = sorted(
        p.relative_to(memory).as_posix()
        for p in (raw.iterdir() if raw.is_dir() else [])
        if p.is_file() and p.name not in SPECIAL and p.name != ".gitkeep" and not p.name.startswith(".")
        and p.name.lower() not in processed and p.stem.lower() not in processed
    )

    issues = {
        "broken_links": broken,
        "orphans": orphans,
        "unindexed": unindexed,
        "no_frontmatter": no_frontmatter,
        "raw_pending": pending,
    }
    return {
        "notes": len(wiki_notes),
        "counts": {k: len(v) for k, v in issues.items()},
        **{k: v[:LIST_LIMIT] for k, v in issues.items()},
    }


def health_report(memory: Path) -> str:
    """The health check as short text, for the lint-wiki skill's prompt."""
    h = health(memory)
    lines = [f"Wiki notes: {h['notes']}."]
    labels = {
        "broken_links": "Broken links",
        "orphans": "Orphan wiki notes (nothing links to them)",
        "unindexed": "Wiki notes missing from their folder's _index.md",
        "no_frontmatter": "Wiki notes without frontmatter `type`",
        "raw_pending": "Items in raw/ not compiled yet",
    }
    for key, label in labels.items():
        items = h[key]
        lines.append(f"\n{label}: {h['counts'][key]}")
        for item in items[:40]:
            if key == "broken_links":
                lines.append(f"- {item['source']}:{item['line']} → [[{item['target']}]]")
            else:
                lines.append(f"- {item}")
    return "\n".join(lines)


def rewrite_links(text: str, old: str, new: str) -> str:
    """Points `[[old]]` (with or without .md, heading or alias) at `new`. Paths without the .md extension."""
    old_key = old.removesuffix(".md").lower()

    def sub(m: re.Match) -> str:
        target = m.group(1).strip()
        if target.removesuffix(".md").lower() != old_key:
            return m.group(0)
        return f"[[{new.removesuffix('.md')}{m.group(2) or ''}{m.group(3) or ''}]]"

    return WIKILINK.sub(sub, text)
