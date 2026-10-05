"""Copia vault-template/ para VAULT_PATH sem sobrescrever nada existente.

Uso: uv run python -m app.setup_vault
"""

import shutil
from pathlib import Path

from app.config import REPO_ROOT, get_settings

TEMPLATE = REPO_ROOT / "vault-template"


def copy_template(template: Path, target: Path) -> tuple[list[Path], list[Path]]:
    """Retorna (criados, ignorados). Arquivos já existentes nunca são tocados."""
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
    target = get_settings().vault_path
    created, skipped = copy_template(TEMPLATE, target)
    print(f"Vault: {target}")
    print(f"  {len(created)} arquivo(s) criado(s), {len(skipped)} já existente(s) preservado(s).")
    for rel in created:
        print(f"  + {rel}")


if __name__ == "__main__":
    main()
