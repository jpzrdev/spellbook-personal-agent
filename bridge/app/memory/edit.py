"""Editing the memory from the HUD: save, create, delete (to .trash/) and move notes.

Gandalf (Tier 3) writes to the same files, so a save carries the version the editor opened (the file's mtime in
nanoseconds, as text: a JavaScript number can't hold it exactly) and fails with a conflict if the file changed in
the meantime, instead of overwriting the other write.
Receipts are a log and are never edited.
"""

import shutil
from datetime import datetime
from pathlib import Path

from app.memory.browse import TEXT_EXTENSIONS, InvalidPath, resolve
from app.memory.links import note_files, rewrite_links
from app.memory.writer import write_atomic

READ_ONLY = {"receipts"}
TRASH = ".trash"


class Conflict(Exception):
    """The file changed since the editor opened it."""

    def __init__(self, version: str):
        super().__init__("the file changed since it was opened")
        self.version = version


def version(path: Path) -> str:
    return str(path.stat().st_mtime_ns)


def _editable(memory: Path, path: str, text_only: bool = True) -> Path:
    target = resolve(memory, path)
    rel = target.relative_to(memory.resolve())
    if not rel.parts:
        raise InvalidPath(path)
    if rel.parts[0] in READ_ONLY:
        raise InvalidPath(f"{path}: {rel.parts[0]}/ is read-only")
    if text_only and target.suffix.lower() not in TEXT_EXTENSIONS:
        raise InvalidPath(f"{path}: only .md and .txt files can be edited")
    return target


def save(memory: Path, path: str, content: str, base: str | None) -> str:
    """Overwrites an existing note. `base`: the `version` the editor opened (None skips the check)."""
    target = _editable(memory, path)
    if not target.is_file():
        raise FileNotFoundError(path)
    current = version(target)
    if base is not None and current != base:
        raise Conflict(current)
    write_atomic(target, content)
    return version(target)


def create(memory: Path, path: str, content: str) -> str:
    if not path.lower().endswith((".md", ".txt")):
        path += ".md"
    target = _editable(memory, path)
    if target.exists():
        raise FileExistsError(path)
    write_atomic(target, content)
    return target.relative_to(memory.resolve()).as_posix()


def delete(memory: Path, path: str, now: datetime) -> str:
    """Moves the file to .trash/ (same relative path; a timestamp if one is there already)."""
    target = _editable(memory, path, text_only=False)
    if not target.is_file():
        raise FileNotFoundError(path)
    rel = target.relative_to(memory.resolve())
    dst = memory / TRASH / rel
    if dst.exists():
        dst = dst.with_name(f"{dst.stem}.{now:%Y%m%d-%H%M%S}{dst.suffix}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(target), str(dst))
    return dst.relative_to(memory).as_posix()


def move(memory: Path, src: str, dst: str) -> dict:
    """Renames/moves a file and points the `[[links]]` of the other notes at the new path."""
    source = _editable(memory, src, text_only=False)
    if not source.is_file():
        raise FileNotFoundError(src)
    if source.suffix and not Path(dst).suffix:
        dst += source.suffix
    target = _editable(memory, dst, text_only=False)
    if target.exists():
        raise FileExistsError(dst)
    root = memory.resolve()
    old, new = source.relative_to(root).as_posix(), target.relative_to(root).as_posix()
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(target))

    updated = []
    for note in note_files(memory):
        rel = note.relative_to(memory).as_posix()
        if rel.split("/")[0] in READ_ONLY:
            continue
        text = note.read_text(encoding="utf-8", errors="replace")
        changed = rewrite_links(text, old, new)
        if changed != text:
            write_atomic(note, changed)
            updated.append(rel)
    return {"path": new, "updated_links": updated}
