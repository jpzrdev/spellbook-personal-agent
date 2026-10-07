"""Renames the old "vault" to "memory" (the folder, the .env key and the untouched template files).

"Vault" was Obsidian's word; Gandalf's notes now live in memory/ and are read and edited in the HUD. This:
- moves the folder vault/ (at the repository root) to memory/, when the .env doesn't point somewhere else;
- renames VAULT_PATH in the .env to MEMORY_PATH (a value of `vault` becomes `memory`);
- replaces the files that are still untouched copies of the old template (CLAUDE.md, routines…) with the new ones;
- points routines at the renamed skill (answer-from-vault → answer-from-memory).

Usage (stop the Bridge first; commit the memory's git so it can be undone):
    uv run python -m app.migrations.memory_rename            # dry run
    uv run python -m app.migrations.memory_rename --apply
"""

import argparse
import hashlib
import re
import shutil
import sys
from pathlib import Path

from app.config import REPO_ROOT
from app.migrations.english_layout import Plan

TEMPLATE = REPO_ROOT / "memory-template"

# sha256 (first 16 hex digits, LF line endings) of the template files before the rename.
OLD_TEMPLATE = {
    "CLAUDE.md": "1ea793728a87ccaf",
    "life/routines/compile-raw.md": "bf66e1204003903c",
    "life/routines/daily-commit.md": "1d63212fe5934761",
    "life/routines/email-summary.md": "3d23a099090ca581",
    "life/routines/morning-notice.md": "ad398b953be6bdf4",
    "life/routines/morning-summary.md": "5bb6764a5afb50e6",
    "life/routines/plan-week.md": "8c3541b5c66327cc",
    "life/routines/sync-calendar.md": "d84505f34105fa71",
    "wiki/_master-index.md": "1be127fa1282b186",
}
SKILLS = {"answer-from-vault": "answer-from-memory"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()[:16]


def env_value(env: Path, key: str) -> str | None:
    if not env.is_file():
        return None
    for line in env.read_text(encoding="utf-8-sig").splitlines():
        if (m := re.match(rf"^\s*{key}=(.*)$", line)):
            return m.group(1).strip()
    return None


def migrate_env(env: Path, plan: Plan) -> None:
    if env_value(env, "VAULT_PATH") is None:
        return
    text = env.read_text(encoding="utf-8-sig")

    def rename(m: re.Match) -> str:
        value = m.group(1).strip()
        return f"MEMORY_PATH={'memory' if value in ('vault', './vault', '') else value}"

    new = re.sub(r"^\s*VAULT_PATH=(.*)$", rename, text, flags=re.M)
    new = new.replace("# Vault path", "# Memory path")
    plan.do(".env: VAULT_PATH → MEMORY_PATH", lambda: env.write_text(new, encoding="utf-8"))


def migrate_folder(old: Path, new: Path, plan: Plan) -> Path:
    """Returns where the memory will be after the migration."""
    if not old.is_dir():
        return new
    if new.exists():
        plan.warn(f"{new} already exists: {old} was not moved (merge them by hand)")
        return old
    plan.do(f"{old.name}/ → {new.name}/", lambda: shutil.move(str(old), str(new)))
    return new


def migrate_files(memory: Path, plan: Plan) -> None:
    """`memory` is where the folder is now (the dry run doesn't move it)."""
    for rel, old_hash in OLD_TEMPLATE.items():
        path, template = memory / rel, TEMPLATE / rel
        if not path.is_file() or not template.is_file():
            continue
        if digest(path) == old_hash:
            if digest(path) != digest(template):
                plan.do(f"{rel}: updated to the new template", lambda p=path, t=template: shutil.copy2(t, p))
        elif "vault" in path.read_text(encoding="utf-8", errors="replace").lower():
            plan.warn(f"{rel} was edited by hand and still says \"vault\": review it against memory-template/{rel}")
    routines = memory / "life" / "routines"
    for path in sorted(routines.glob("*.md")) if routines.is_dir() else []:
        text = path.read_text(encoding="utf-8")
        new = text
        for old, name in SKILLS.items():
            new = re.sub(rf"^(skill:\s*){re.escape(old)}\s*$", rf"\g<1>{name}", new, flags=re.M)
        if new != text:
            plan.do(f"life/routines/{path.name}: skill renamed", lambda p=path, n=new: p.write_text(n, encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="apply the changes (default: dry run)")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    plan = Plan(apply=args.apply)
    env = REPO_ROOT / ".env"
    configured = env_value(env, "MEMORY_PATH") or env_value(env, "VAULT_PATH") or "vault"
    old = Path(configured)
    old = old if old.is_absolute() else (REPO_ROOT / old).resolve()
    if old.is_dir():
        migrate_files(old, plan)  # before the move: the steps run right away with --apply
    if old == (REPO_ROOT / "vault").resolve():
        memory = migrate_folder(old, REPO_ROOT / "memory", plan)
    else:
        memory = old  # a custom location: the folder stays where it is
    migrate_env(env, plan)

    print(f"{'Applied' if args.apply else 'Dry run (use --apply to change files)'}: {memory}")
    for step in plan.steps:
        print(f"  - {step}")
    if not plan.steps:
        print("  nothing to migrate")
    for warning in plan.warnings:
        print(f"  ! {warning}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
