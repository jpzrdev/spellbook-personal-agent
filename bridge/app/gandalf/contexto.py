"""Contexto curto que acompanha cada pedido ao Tier 2."""

from datetime import datetime, timedelta
from pathlib import Path

from app.gandalf.tier1 import NOMES_DIA, data_por_extenso
from app.biblioteca import listar as listar_biblioteca
from app.skills.catalog import listar_skills
from app.vault.reader import ler_texto

LIMITE_SOBRE_MIM = 4000
LIMITE_INDICE = 3000


def _cortar(texto: str, limite: int) -> str:
    texto = texto.strip()
    return texto if len(texto) <= limite else texto[:limite].rstrip() + "\n…(cortado)"


def montar_contexto(vault: Path, agora: datetime) -> str:
    partes = [f"Agora: {data_por_extenso(agora.date())} de {agora:%Y}, {agora:%H:%M} (America/Sao_Paulo)."]
    # Calendário curto: o modelo erra dia da semana ↔ data quando precisa calcular sozinho.
    dias = [agora.date() + timedelta(days=i) for i in range(15)]
    partes.append("Próximos dias: " + "; ".join(f"{NOMES_DIA[d.weekday()][:3]} {d:%d/%m}" for d in dias) + ".")

    sobre_mim = []
    pasta = vault / "wiki" / "sobre-mim"
    if pasta.is_dir():
        for arquivo in sorted(pasta.glob("*.md")):
            sobre_mim.append(f"### {arquivo.stem}\n{ler_texto(arquivo).strip()}")
    if sobre_mim:
        partes.append("## Sobre o usuário\n" + _cortar("\n\n".join(sobre_mim), LIMITE_SOBRE_MIM))

    indice = ler_texto(vault / "wiki" / "_master-index.md")
    if indice:
        partes.append("## Índice do wiki (_master-index.md)\n" + _cortar(indice, LIMITE_INDICE))

    temas = listar_biblioteca(vault)
    if temas:
        linhas = [f"- `{t['slug']}`: {t['titulo']} ({t['tipo']}, atualizado {t['atualizado'] or '?'})" for t in temas[:30]]
        partes.append("## Biblioteca (pesquisas e planos já guardados)\n" + "\n".join(linhas))

    skills = listar_skills(vault)
    if skills:
        linhas = [f"- {s.nome}: {s.descricao}" for s in skills]
        partes.append("## Skills disponíveis no Claude Code\n" + "\n".join(linhas))
    else:
        partes.append("## Skills disponíveis no Claude Code\n(nenhuma)")

    return "\n\n".join(partes)
