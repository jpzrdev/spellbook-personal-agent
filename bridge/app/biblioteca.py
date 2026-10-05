"""Biblioteca: pesquisas e planos guardados em wiki/biblioteca/<tema>/ (um `_index.md` + uma nota por parte).

Fluxo: o Gandalf pesquisa na web (sessão só com web, sem vault) → o resultado aparece no HUD → se o
usuário tocar "Guardar no vault", outra sessão (sem web, só escreve em wiki/biblioteca/) organiza por tema.
"""

import re
from datetime import date
from pathlib import Path

import frontmatter

from app.vault import reader, writer

BIBLIOTECA = Path("wiki/biblioteca")


class TemaInvalido(ValueError):
    pass


def _titulo(conteudo: str, padrao: str) -> str:
    if m := re.search(r"^#\s+(.+)$", conteudo, re.M):
        return m.group(1).strip()
    return padrao.replace("-", " ").capitalize()


def _resumo(conteudo: str) -> str:
    """Primeiro parágrafo de texto depois do título (para o cartão)."""
    for bloco in re.split(r"\n\s*\n", re.sub(r"^#.*$", "", conteudo, flags=re.M)):
        texto = " ".join(bloco.split())
        if texto and not texto.startswith(("|", "-", "*", ">", "```")):
            return texto[:220] + ("…" if len(texto) > 220 else "")
    return ""


def pasta_tema(vault: Path, slug: str) -> Path:
    if not re.fullmatch(r"[\w-]+", slug):
        raise TemaInvalido(slug)
    pasta = vault / BIBLIOTECA / slug
    if not pasta.is_dir():
        raise FileNotFoundError(slug)
    return pasta


def _partes(vault: Path, pasta: Path) -> list[dict]:
    partes = []
    for arquivo in sorted(pasta.glob("*.md")):
        if arquivo.name.startswith("_"):
            continue
        try:
            post = frontmatter.load(arquivo)
            ordem = post.metadata.get("ordem")
            partes.append({
                "nota": arquivo.relative_to(vault).as_posix(),
                "titulo": _titulo(post.content, arquivo.stem),
                "ordem": int(ordem) if isinstance(ordem, int) or str(ordem).isdigit() else None,
            })
        except Exception:
            continue
    return sorted(partes, key=lambda p: (p["ordem"] is None, p["ordem"] or 0, p["titulo"]))


def _cartao(vault: Path, pasta: Path) -> dict:
    indice = pasta / "_index.md"
    meta, conteudo = {}, ""
    if indice.is_file():
        try:
            post = frontmatter.load(indice)
            meta, conteudo = dict(post.metadata), post.content
        except Exception:
            conteudo = reader.ler_texto(indice)
    atualizado = meta.get("atualizado") or meta.get("criado")
    return {
        "slug": pasta.name,
        "titulo": _titulo(conteudo, pasta.name),
        "tipo": "plano" if meta.get("tipo") == "plano" else "pesquisa",
        "resumo": _resumo(conteudo),
        "atualizado": str(atualizado)[:10] if atualizado else None,
        "partes": len([a for a in pasta.glob("*.md") if not a.name.startswith("_")]),
    }


def listar(vault: Path) -> list[dict]:
    raiz = vault / BIBLIOTECA
    if not raiz.is_dir():
        return []
    itens = [_cartao(vault, p) for p in raiz.iterdir() if p.is_dir() and not p.name.startswith((".", "_"))]
    return sorted(itens, key=lambda i: i["atualizado"] or "", reverse=True)


def detalhe(vault: Path, slug: str) -> dict:
    pasta = pasta_tema(vault, slug)
    indice = pasta / "_index.md"
    return {
        **_cartao(vault, pasta),
        "indice": indice.relative_to(vault).as_posix() if indice.is_file() else None,
        "lista_partes": _partes(vault, pasta),
        "tem_checklist": (pasta / "checklist.md").is_file(),
    }


def contexto_para_atualizar(vault: Path, slug: str, limite: int = 6000) -> str:
    """O que já está guardado sobre o tema (vai no pedido da pesquisa de atualização, que não lê o vault)."""
    pasta = pasta_tema(vault, slug)
    partes = []
    for arquivo in [pasta / "_index.md", *sorted(a for a in pasta.glob("*.md") if not a.name.startswith("_"))]:
        if arquivo.is_file():
            partes.append(f"### {arquivo.name}\n{frontmatter.load(arquivo).content.strip()}")
    texto = "\n\n".join(partes)
    return texto if len(texto) <= limite else texto[:limite] + "\n…(cortado)"


def tarefas_do_checklist(vault: Path, slug: str, hoje: date) -> list[str]:
    """Itens abertos do checklist.md do tema viram tarefas (#biblioteca/<tema>), sem repetir as que já existem."""
    pasta = pasta_tema(vault, slug)
    arquivo = pasta / "checklist.md"
    if not arquivo.is_file():
        raise FileNotFoundError("checklist.md")
    existentes = {t.texto.strip().lower() for t in reader.ler_tarefas(vault)}
    criadas = []
    for linha in frontmatter.load(arquivo).content.splitlines():
        m = re.match(r"^\s*[-*] \[ \] (.+)$", linha)
        if not m:
            continue
        texto = re.sub(r"\s*[📅⏫🔼🔽⏬🔺]\s*\S*", "", m.group(1)).strip()
        if texto and texto.lower() not in existentes:
            writer.adicionar_tarefa(vault, texto[:300], tags=[f"biblioteca/{slug}"])
            existentes.add(texto.lower())
            criadas.append(texto)
    return criadas
