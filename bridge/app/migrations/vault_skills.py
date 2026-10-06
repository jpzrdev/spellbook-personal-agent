"""Moves the skills out of the vault (vault/.claude/skills/) into the project's skills/ folder.

Skills used to be copied into the vault; now they live in skills/ at the repository root (the native ones are
versioned, yours stay out of git). For each skill in the vault:
- a copy identical to the one in skills/ is removed (skills/ already has it);
- a skill skills/ doesn't have is moved there;
- a skill that differs from the one in skills/ is left in the vault, with a warning: merge it by hand.

Usage: uv run python -m app.migrations.vault_skills [--apply] [--vault PATH]
"""

import argparse
import filecmp
import shutil
import sys
from pathlib import Path

from app.config import get_settings
from app.migrations.english_layout import Plan


def _same(a: Path, b: Path) -> bool:
    """Whether two skill folders have the same files with the same contents."""
    files_a = sorted(p.relative_to(a) for p in a.rglob("*") if p.is_file())
    files_b = sorted(p.relative_to(b) for p in b.rglob("*") if p.is_file())
    return files_a == files_b and all(filecmp.cmp(a / f, b / f, shallow=False) for f in files_a)


def migrate_skills(vault: Path, skills: Path, plan: Plan) -> None:
    old = vault / ".claude" / "skills"
    if not old.is_dir():
        return
    for folder in sorted(p for p in old.iterdir() if p.is_dir()):
        target = skills / folder.name
        rel = folder.relative_to(vault).as_posix()
        if not (folder / "SKILL.md").is_file():
            plan.warn(f"{rel} has no SKILL.md; left untouched")
        elif not target.exists():
            plan.do(f"{rel} → skills/{folder.name} (moved)",
                    lambda f=folder, t=target: (t.parent.mkdir(parents=True, exist_ok=True), shutil.move(str(f), str(t))))
        elif _same(folder, target):
            plan.do(f"{rel} removed (identical to skills/{folder.name})", lambda f=folder: shutil.rmtree(f))
        else:
            plan.warn(f"{rel} differs from skills/{folder.name}; left in the vault (merge them by hand)")
    if plan.apply and not any(old.rglob("SKILL.md")):
        shutil.rmtree(old)  # only .gitkeep and empty folders were left


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="apply the changes (default: dry run)")
    parser.add_argument("--vault", type=Path, default=None)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles default to cp1252

    settings = get_settings()
    vault = (args.vault or settings.vault_path).resolve()
    plan = Plan(apply=args.apply)
    migrate_skills(vault, settings.skills_path, plan)

    print(f"{'Applied' if args.apply else 'Dry run (use --apply to change files)'}: {vault} → {settings.skills_path}")
    for step in plan.steps:
        print(f"  - {step}")
    if not plan.steps:
        print("  nothing to migrate")
    for warning in plan.warnings:
        print(f"  ! {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
