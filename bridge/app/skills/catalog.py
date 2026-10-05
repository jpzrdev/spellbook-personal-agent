"""Catálogo das skills do Claude Code do vault (vault/.claude/skills/<nome>/SKILL.md)."""

import re
from dataclasses import dataclass, field
from pathlib import Path

import frontmatter

SKILLS = Path(".claude/skills")


@dataclass
class Skill:
    nome: str
    descricao: str
    pasta: str
    # Ferramentas extras liberadas quando o Tier 3 roda esta skill (ex.: MCP: mcp__google_calendar).
    ferramentas: list[str] = field(default_factory=list)
    # `saida:` no SKILL.md manda no modo da sessão, de onde quer que a skill rode: efemera (só leitura,
    # resultado no HUD), pesquisa (só web, sem vault) ou biblioteca (só escreve em wiki/biblioteca/).
    saida: str = "vault"
    titulo: str | None = None  # título do card em "Resumos de hoje"


def _ferramentas(valor) -> list[str]:
    """`allowed-tools` pode ser lista ou texto separado por vírgula/espaço (formato do Claude Code)."""
    if not valor:
        return []
    if isinstance(valor, list):
        return [str(i).strip() for i in valor if str(i).strip()]
    # Separa por vírgula/espaço sem quebrar o que está entre parênteses: "Bash(git *)".
    return re.findall(r"[^,\s(]+(?:\([^)]*\))?", str(valor))


def obter_skill(vault: Path, nome: str) -> Skill | None:
    return next((s for s in listar_skills(vault) if s.nome == nome), None)


def listar_skills(vault: Path) -> list[Skill]:
    pasta = vault / SKILLS
    if not pasta.is_dir():
        return []
    skills: list[Skill] = []
    for arquivo in sorted(pasta.glob("*/SKILL.md")):
        try:
            meta = frontmatter.load(arquivo).metadata
        except Exception:  # SKILL.md malformado não derruba o catálogo
            continue
        skills.append(
            Skill(
                nome=str(meta.get("name") or arquivo.parent.name),
                descricao=str(meta.get("description") or "").strip(),
                pasta=arquivo.parent.name,
                ferramentas=_ferramentas(meta.get("allowed-tools")),
                saida=meta["saida"] if meta.get("saida") in ("efemera", "pesquisa", "biblioteca") else "vault",
                titulo=str(meta["titulo"]).strip() if meta.get("titulo") else None,
            )
        )
    return skills
