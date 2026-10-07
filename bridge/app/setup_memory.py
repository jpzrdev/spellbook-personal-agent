"""Copies memory-template/ to MEMORY_PATH without overwriting anything that exists.

Usage: uv run python -m app.setup_memory
"""

import shutil
from pathlib import Path

from app.config import REPO_ROOT, get_settings

TEMPLATE = REPO_ROOT / "memory-template"


def copy_template(template: Path, target: Path) -> tuple[list[Path], list[Path]]:
    """Returns (created, skipped). Existing files are never touched."""
    created: list[Path] = []
    skipped: list[Path] = []
    for src in sorted(template.rglob("*")):
        rel = src.relative_to(template)
        dst = target / rel
        if src.is_dir():
            dst.mkdir(parents=True, exist_ok=True)
        elif dst.exists():
            skipped.append(rel)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            created.append(rel)
    return created, skipped


def main() -> None:
    target = get_settings().memory_path
    created, skipped = copy_template(TEMPLATE, target)
    print(f"Memory: {target}")
    print(f"  {len(created)} file(s) created, {len(skipped)} existing file(s) kept.")
    for rel in created:
        print(f"  + {rel}")


if __name__ == "__main__":
    main()
