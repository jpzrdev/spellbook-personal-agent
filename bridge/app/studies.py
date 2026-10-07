"""Studies: the personal collection of each subject in wiki/studies/<subject>/.

A subject has topics (long notes written by the AI, optional `order` in the frontmatter), the user's
annotations (`_annotations/`) and uploaded material (`_sources/`). There is no progress tracking or scheduled
review: the user studies whenever they want, asks questions in the chat and tests themselves with ephemeral
quizzes (`app.studies_quiz`).
"""

import re
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path

import frontmatter

from app.locales import t
from app.memory import reader, writer

STUDIES = Path("wiki/studies")
ANNOTATIONS = "_annotations"
SOURCES = "_sources"


class InvalidPath(ValueError):
    pass


def md_title(content: str, default: str) -> str:
    if m := re.search(r"^#\s+(.+)$", content, re.M):
        return m.group(1).strip()
    return default.replace("-", " ").capitalize()


def subject_folder(memory: Path, subject: str) -> Path:
    if not re.fullmatch(r"[\w-]+", subject):
        raise InvalidPath(subject)
    folder = memory / STUDIES / subject
    if not folder.is_dir():
        raise FileNotFoundError(subject)
    return folder


def subject_note(memory: Path, subject: str, note: str) -> Path:
    """Memory-relative path (`wiki/studies/<subject>/x.md`) → file, without leaving the subject."""
    folder = subject_folder(memory, subject).resolve()
    path = (memory / note).resolve()
    if path.suffix != ".md" or not path.is_relative_to(folder) or not path.is_file():
        raise InvalidPath(note)
    return path


# ---------- topics ----------

def _short_summary(content: str, limit: int = 220) -> str:
    """First paragraph of running text in the note (no headings, lists, tables or callouts)."""
    for block in re.split(r"\n\s*\n", content):
        block = block.strip()
        if not block or block[0] in "#>|-*`" or re.match(r"\d+[.)]\s", block):
            continue
        text = re.sub(r"\s+", " ", re.sub(r"[*_`]|\[\[([^\]|]+\|)?|\]\]", "", block))
        return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"
    return ""


@dataclass
class Topic:
    note: str
    title: str
    order: int | None
    summary: str
    words: int


def _topic(memory: Path, path: Path) -> Topic:
    post = frontmatter.load(path)
    try:
        order = int(post.metadata["order"]) if post.metadata.get("order") is not None else None
    except (TypeError, ValueError):
        order = None
    return Topic(
        note=path.relative_to(memory).as_posix(),
        title=md_title(post.content, path.stem),
        order=order,
        summary=_short_summary(re.sub(r"^#\s+.+$", "", post.content, count=1, flags=re.M)),
        words=len(re.findall(r"\w+", post.content)),
    )


def topics(memory: Path, subject: str) -> list[Topic]:
    folder = subject_folder(memory, subject)
    items = []
    for path in sorted(folder.rglob("*.md")):
        # `_index.md`, `_annotations/` (the user's) and `_sources/` (uploaded material) are not topics
        if any(part.startswith("_") for part in path.relative_to(folder).parts):
            continue
        try:
            items.append(_topic(memory, path))
        except Exception:  # a note with broken frontmatter doesn't break the screen
            continue
    return sorted(items, key=lambda x: (x.order is None, x.order or 0, x.title))


def _index(folder: Path) -> tuple[dict, str]:
    path = folder / "_index.md"
    if not path.is_file():
        return {}, ""
    try:
        post = frontmatter.load(path)
        return dict(post.metadata), post.content
    except Exception:
        return {}, reader.read_text(path)


def _summary(memory: Path, folder: Path) -> dict:
    subject = folder.name
    _, content = _index(folder)
    tops = topics(memory, subject)
    return {
        "subject": subject,
        "title": md_title(content, subject),
        "topic_count": len(tops),
        "annotation_count": len(list_annotations(memory, subject)),
        "source_count": len(list_sources(memory, subject)),
        "titles": [x.title for x in tops[:6]],
    }


def remove_subject(memory: Path, subject: str) -> dict:
    """Deletes the whole subject (topics, the user's annotations and uploaded material) and removes its line
    from `wiki/studies/_index.md`. Explicit request from the user in the HUD: the only bulk deletion in the wiki."""
    folder = subject_folder(memory, subject)
    files = [a for a in folder.rglob("*") if a.is_file()]
    removed = {
        "subject": subject,
        "title": md_title(_index(folder)[1], subject),
        "topics": len(topics(memory, subject)),
        "annotations": sum(1 for a in files if ANNOTATIONS in a.relative_to(folder).parts),
        "sources": sum(1 for a in files if SOURCES in a.relative_to(folder).parts),
        "files": len(files),
    }
    shutil.rmtree(folder)
    index = memory / STUDIES / "_index.md"
    if index.is_file():
        text = reader.read_text(index)
        link = re.compile(rf"\[\[wiki/studies/{re.escape(subject)}(/|\||\]\])")
        lines = [line for line in text.splitlines() if not link.search(line)]
        empty = t("file.no_subjects")
        if not any(re.search(r"\[\[wiki/studies/[\w-]+", line) for line in lines) and empty not in text:
            lines.append(empty)
        new = "\n".join(lines).rstrip() + "\n"
        if new != text:
            writer.write_atomic(index, new)
    return removed


def list_subjects(memory: Path) -> list[dict]:
    root = memory / STUDIES
    if not root.is_dir():
        return []
    return [_summary(memory, p) for p in sorted(root.iterdir()) if p.is_dir() and not p.name.startswith(".")]


def detail(memory: Path, subject: str) -> dict:
    folder = subject_folder(memory, subject)
    _, content = _index(folder)
    annotations = list_annotations(memory, subject)
    return {
        **_summary(memory, folder),
        "index": content.strip(),
        "topics": [
            {**asdict(x), "annotation_count": sum(1 for a in annotations if a["topic"] == x.note)} for x in topics(memory, subject)
        ],
        "annotations": [a for a in annotations if not a["topic"]],
        "sources": list_sources(memory, subject),
    }


# ---------- the user's annotations ----------
# They live in `wiki/studies/<subject>/_annotations/`, one per file, with `topic:` pointing at the topic
# note (or empty = a general annotation for the subject). They belong to the user: the AI reads them but doesn't edit.

def _annotations_folder(memory: Path, subject: str) -> Path:
    return subject_folder(memory, subject) / ANNOTATIONS


def _annotation(memory: Path, path: Path) -> dict:
    post = frontmatter.load(path)
    meta = post.metadata
    return {
        "file": path.relative_to(memory).as_posix(),
        "title": str(meta.get("title") or "").strip() or None,
        "text": post.content.strip(),
        "topic": meta.get("topic") or None,
        "source": meta.get("source") or None,
        "created": str(meta.get("created") or ""),
        "updated": str(meta.get("updated") or meta.get("created") or ""),
    }


def list_annotations(memory: Path, subject: str, topic: str | None = None) -> list[dict]:
    folder = _annotations_folder(memory, subject)
    if not folder.is_dir():
        return []
    items = []
    for path in sorted(folder.glob("*.md"), reverse=True):  # names start with the date: newest first
        try:
            a = _annotation(memory, path)
        except Exception:
            continue
        if topic is None or a["topic"] == topic:
            items.append(a)
    return items


def _annotation_file(memory: Path, subject: str, file: str) -> Path:
    folder = _annotations_folder(memory, subject).resolve()
    target = (memory / file).resolve()
    if target.suffix != ".md" or target.parent != folder or not target.is_file():
        raise InvalidPath(file)
    return target


def create_annotation(memory: Path, subject: str, text: str, now, title: str | None = None, topic: str | None = None,
                      source: str | None = None) -> dict:
    if topic:
        subject_note(memory, subject, topic)  # validates that the topic belongs to this subject
    folder = _annotations_folder(memory, subject)
    folder.mkdir(exist_ok=True)
    base = f"{now:%Y-%m-%d-%H%M%S}-{writer.slugify(title or text.splitlines()[0][:40] or 'annotation', 40)}"
    path = folder / f"{base}.md"
    n = 2
    while path.exists():
        path = folder / f"{base}-{n}.md"
        n += 1
    post = frontmatter.Post(text.strip(), type="annotation", title=title or None, topic=topic or None,
                            source=source or None, created=now.isoformat(timespec="seconds"))
    post.metadata = {k: v for k, v in post.metadata.items() if v is not None}
    writer.write_atomic(path, frontmatter.dumps(post, sort_keys=False) + "\n")
    return _annotation(memory, path)


def update_annotation(memory: Path, subject: str, file: str, text: str, now, title: str | None = None) -> dict:
    target = _annotation_file(memory, subject, file)
    post = frontmatter.load(target)
    post.content = text.strip()
    if title is not None:
        post.metadata["title"] = title.strip() or None
        if not post.metadata["title"]:
            del post.metadata["title"]
    post.metadata["updated"] = now.isoformat(timespec="seconds")
    writer.write_atomic(target, frontmatter.dumps(post, sort_keys=False) + "\n")
    return _annotation(memory, target)


def remove_annotation(memory: Path, subject: str, file: str) -> None:
    _annotation_file(memory, subject, file).unlink()


# ---------- uploaded material (documents and texts for Gandalf to structure) ----------

MATERIAL_EXTENSIONS = {".pdf", ".md", ".txt", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".csv", ".html"}


def _docx_text(data: bytes) -> str:
    """Text of a .docx without dependencies (Claude Code can't read .docx; it reads the .md written next to it)."""
    import io
    import zipfile
    from xml.etree import ElementTree

    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        root = ElementTree.fromstring(z.read("word/document.xml"))
    paragraphs = ["".join(x.text or "" for x in p.iter(f"{ns}t")) for p in root.iter(f"{ns}p")]
    return "\n\n".join(p for p in paragraphs if p.strip())


def save_source(memory: Path, subject: str, name: str, data: bytes, now) -> list[str]:
    """Stores the material in `_sources/` (never overwrites). A .docx gets a .md with its text next to it."""
    stem, ext = Path(name).stem, Path(name).suffix.lower()
    if ext not in MATERIAL_EXTENSIONS:
        raise ValueError(f"unsupported format: {ext or name} (use PDF, text, Markdown, Word or an image)")
    folder = subject_folder(memory, subject) / SOURCES
    folder.mkdir(exist_ok=True)
    base = f"{now:%Y-%m-%d-%H%M%S}-{writer.slugify(stem, 50)}"
    path = folder / f"{base}{ext}"
    n = 2
    while path.exists():
        path = folder / f"{base}-{n}{ext}"
        n += 1
    path.write_bytes(data)
    saved = [path.relative_to(memory).as_posix()]
    if ext == ".docx":
        try:
            md = path.with_suffix(".md")
            note = t("file.docx_extracted", name=path.name)
            md.write_text(f"# {stem}\n\n{note}\n\n{_docx_text(data)}\n", encoding="utf-8")
            saved.append(md.relative_to(memory).as_posix())
        except Exception:
            pass  # odd .docx: only the original stays
    return saved


def list_sources(memory: Path, subject: str) -> list[dict]:
    folder = subject_folder(memory, subject) / SOURCES
    if not folder.is_dir():
        return []
    return [
        {"file": a.relative_to(memory).as_posix(), "name": a.name, "size": a.stat().st_size}
        for a in sorted(folder.iterdir(), reverse=True)
        if a.is_file()
    ]
