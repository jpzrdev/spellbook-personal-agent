"""Read-only browsing of the vault (HUD Vault screen)."""

from pathlib import Path

import frontmatter

# Internal folders hidden from the tree (configuration and version control).
HIDDEN = {".git", ".obsidian", ".trash"}
TEXT_EXTENSIONS = {".md", ".txt"}
NOTE_SIZE_LIMIT = 2 * 1024 * 1024


class InvalidPath(ValueError):
    pass


def resolve(vault: Path, path: str) -> Path:
    """Relative path → absolute, making sure it stays inside the vault (no `..`, no hidden folders)."""
    rel = Path(path.replace("\\", "/").lstrip("/"))
    if any(p in HIDDEN or p == ".." for p in rel.parts):
        raise InvalidPath(path)
    target = (vault / rel).resolve()
    try:
        target.relative_to(vault.resolve())
    except ValueError as e:
        raise InvalidPath(path) from e
    return target


def tree(vault: Path, folder: Path | None = None) -> list[dict]:
    """Folders and files (folders first, alphabetical), recursive."""
    folder = folder or vault
    items: list[dict] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except OSError:
        return items
    for p in children:
        if p.name in HIDDEN or p.name.startswith(".tmp-") or p.name == ".gitkeep":
            continue
        rel = p.relative_to(vault).as_posix()
        if p.is_dir():
            items.append({"name": p.name, "path": rel, "type": "folder", "children": tree(vault, p)})
        else:
            items.append({"name": p.name, "path": rel, "type": "file", "size": p.stat().st_size})
    return items


def read_note(vault: Path, path: str) -> dict:
    target = resolve(vault, path)
    if not target.is_file():
        raise FileNotFoundError(path)
    if target.suffix.lower() not in TEXT_EXTENSIONS:
        return {"path": path, "text": None, "metadata": {}, "binary": True, "size": target.stat().st_size}
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
    return {"path": path, "text": text, "metadata": meta, "binary": False, "size": target.stat().st_size}
