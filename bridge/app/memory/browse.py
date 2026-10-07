"""Browsing the memory (HUD Memory screen). Editing is in app.memory.edit."""

from pathlib import Path

import frontmatter

# Internal folders hidden from the tree (configuration and version control).
HIDDEN = {".git", ".obsidian", ".trash"}  # .obsidian: an editor's settings, if the folder is opened in one
TEXT_EXTENSIONS = {".md", ".txt"}
NOTE_SIZE_LIMIT = 2 * 1024 * 1024


class InvalidPath(ValueError):
    pass


def resolve(memory: Path, path: str) -> Path:
    """Relative path → absolute, making sure it stays inside the memory (no `..`, no hidden folders)."""
    rel = Path(path.replace("\\", "/").lstrip("/"))
    if any(p in HIDDEN or p == ".." for p in rel.parts):
        raise InvalidPath(path)
    target = (memory / rel).resolve()
    try:
        target.relative_to(memory.resolve())
    except ValueError as e:
        raise InvalidPath(path) from e
    return target


def tree(memory: Path, folder: Path | None = None) -> list[dict]:
    """Folders and files (folders first, alphabetical), recursive."""
    folder = folder or memory
    items: list[dict] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except OSError:
        return items
    for p in children:
        if p.name in HIDDEN or p.name.startswith(".tmp-") or p.name == ".gitkeep":
            continue
        rel = p.relative_to(memory).as_posix()
        if p.is_dir():
            items.append({"name": p.name, "path": rel, "type": "folder", "children": tree(memory, p)})
        else:
            items.append({"name": p.name, "path": rel, "type": "file", "size": p.stat().st_size})
    return items


def read_note(memory: Path, path: str) -> dict:
    target = resolve(memory, path)
    if not target.is_file():
        raise FileNotFoundError(path)
    if target.suffix.lower() not in TEXT_EXTENSIONS:
        return {"path": path, "text": None, "metadata": {}, "binary": True, "size": target.stat().st_size,
                "version": str(target.stat().st_mtime_ns)}
    if target.stat().st_size > NOTE_SIZE_LIMIT:
        raise InvalidPath(f"{path}: file too large to show")
    raw = target.read_text(encoding="utf-8", errors="replace")
    try:
        post = frontmatter.loads(raw)
        meta, text = post.metadata, post.content
    except Exception:  # malformed frontmatter: show the raw text
        meta, text = {}, raw
    # YAML dates become text (JSON cannot serialize date).
    meta = {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in meta.items()}
    return {"path": path, "text": text, "raw": raw, "metadata": meta, "binary": False, "size": target.stat().st_size,
            "version": str(target.stat().st_mtime_ns)}
