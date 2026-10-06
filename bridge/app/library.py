"""Library: research and plans saved in wiki/library/<topic>/ (an `_index.md` + one note per part).

Flow: Gandalf researches on the web (web-only session, no vault) → the result shows up in the HUD → if
the user taps "Save to vault", another session (no web, writes only in wiki/library/) organizes it by topic.
"""

import re
from datetime import date
from pathlib import Path

import frontmatter

from app.vault import reader, writer

LIBRARY = Path("wiki/library")


class InvalidTopic(ValueError):
    pass


def _title(content: str, default: str) -> str:
    if m := re.search(r"^#\s+(.+)$", content, re.M):
        return m.group(1).strip()
    return default.replace("-", " ").capitalize()


def _summary(content: str) -> str:
    """First text paragraph after the title (for the card)."""
    for block in re.split(r"\n\s*\n", re.sub(r"^#.*$", "", content, flags=re.M)):
        text = " ".join(block.split())
        if text and not text.startswith(("|", "-", "*", ">", "```")):
            return text[:220] + ("…" if len(text) > 220 else "")
    return ""


def topic_folder(vault: Path, slug: str) -> Path:
    if not re.fullmatch(r"[\w-]+", slug):
        raise InvalidTopic(slug)
    folder = vault / LIBRARY / slug
    if not folder.is_dir():
        raise FileNotFoundError(slug)
    return folder


def _parts(vault: Path, folder: Path) -> list[dict]:
    parts = []
    for path in sorted(folder.glob("*.md")):
        if path.name.startswith("_"):
            continue
        try:
            post = frontmatter.load(path)
            order = post.metadata.get("order")
            parts.append({
                "note": path.relative_to(vault).as_posix(),
                "title": _title(post.content, path.stem),
                "order": int(order) if isinstance(order, int) or str(order).isdigit() else None,
            })
        except Exception:
            continue
    return sorted(parts, key=lambda p: (p["order"] is None, p["order"] or 0, p["title"]))


def _card(vault: Path, folder: Path) -> dict:
    index = folder / "_index.md"
    meta, content = {}, ""
    if index.is_file():
        try:
            post = frontmatter.load(index)
            meta, content = dict(post.metadata), post.content
        except Exception:
            content = reader.read_text(index)
    updated = meta.get("updated") or meta.get("created")
    return {
        "slug": folder.name,
        "title": _title(content, folder.name),
        "kind": "plan" if meta.get("type") == "plan" else "research",
        "summary": _summary(content),
        "updated": str(updated)[:10] if updated else None,
        "part_count": len([a for a in folder.glob("*.md") if not a.name.startswith("_")]),
    }


def list_topics(vault: Path) -> list[dict]:
    root = vault / LIBRARY
    if not root.is_dir():
        return []
    items = [_card(vault, p) for p in root.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))]
    return sorted(items, key=lambda i: i["updated"] or "", reverse=True)


def detail(vault: Path, slug: str) -> dict:
    folder = topic_folder(vault, slug)
    index = folder / "_index.md"
    return {
        **_card(vault, folder),
        "index": index.relative_to(vault).as_posix() if index.is_file() else None,
        "parts": _parts(vault, folder),
        "has_checklist": (folder / "checklist.md").is_file(),
    }


def context_for_update(vault: Path, slug: str, limit: int = 6000) -> str:
    """What is already saved about the topic (goes into the update research request, which can't read the vault)."""
    folder = topic_folder(vault, slug)
    parts = []
    for path in [folder / "_index.md", *sorted(a for a in folder.glob("*.md") if not a.name.startswith("_"))]:
        if path.is_file():
            parts.append(f"### {path.name}\n{frontmatter.load(path).content.strip()}")
    text = "\n\n".join(parts)
    return text if len(text) <= limit else text[:limit] + "\n…(truncated)"


def checklist_to_tasks(vault: Path, slug: str, today: date) -> list[str]:
    """Open items of the topic's checklist.md become tasks (#library/<topic>), skipping existing ones."""
    folder = topic_folder(vault, slug)
    path = folder / "checklist.md"
    if not path.is_file():
        raise FileNotFoundError("checklist.md")
    existing = {t.text.strip().lower() for t in reader.read_tasks(vault)}
    created = []
    for line in frontmatter.load(path).content.splitlines():
        m = re.match(r"^\s*[-*] \[ \] (.+)$", line)
        if not m:
            continue
        text = re.sub(r"\s*[📅⏫🔼🔽⏬🔺]\s*\S*", "", m.group(1)).strip()
        if text and text.lower() not in existing:
            writer.add_task(vault, text[:300], tags=[f"library/{slug}"])
            existing.add(text.lower())
            created.append(text)
    return created
