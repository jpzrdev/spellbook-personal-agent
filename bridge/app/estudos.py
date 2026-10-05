"""Estudos: o acervo pessoal de cada matéria em wiki/estudos/<materia>/.

Uma matéria tem tópicos (notas longas escritas pela IA, `ordem` opcional no frontmatter), anotações do
usuário (`_anotacoes/`) e material enviado (`_fontes/`). Não há progresso nem revisões agendadas: o
usuário estuda quando quiser, tira dúvidas no chat e se testa com quizzes efêmeros (`app.estudos_quiz`).
"""

import re
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path

import frontmatter

from app.vault import reader, writer

ESTUDOS = Path("wiki/estudos")


class CaminhoInvalido(ValueError):
    pass


def _titulo_md(conteudo: str, padrao: str) -> str:
    if m := re.search(r"^#\s+(.+)$", conteudo, re.M):
        return m.group(1).strip()
    return padrao.replace("-", " ").capitalize()


def pasta_materia(vault: Path, materia: str) -> Path:
    if not re.fullmatch(r"[\w-]+", materia):
        raise CaminhoInvalido(materia)
    pasta = vault / ESTUDOS / materia
    if not pasta.is_dir():
        raise FileNotFoundError(materia)
    return pasta


def nota_da_materia(vault: Path, materia: str, nota: str) -> Path:
    """Caminho relativo ao vault (`wiki/estudos/<materia>/x.md`) → arquivo, sem sair da matéria."""
    pasta = pasta_materia(vault, materia).resolve()
    arquivo = (vault / nota).resolve()
    if arquivo.suffix != ".md" or not arquivo.is_relative_to(pasta) or not arquivo.is_file():
        raise CaminhoInvalido(nota)
    return arquivo


# ---------- tópicos ----------

def _resumo_curto(conteudo: str, limite: int = 220) -> str:
    """Primeiro parágrafo de texto corrido da nota (sem títulos, listas, tabelas nem callouts)."""
    for bloco in re.split(r"\n\s*\n", conteudo):
        bloco = bloco.strip()
        if not bloco or bloco[0] in "#>|-*`" or re.match(r"\d+[.)]\s", bloco):
            continue
        texto = re.sub(r"\s+", " ", re.sub(r"[*_`]|\[\[([^\]|]+\|)?|\]\]", "", bloco))
        return texto if len(texto) <= limite else texto[: limite - 1].rsplit(" ", 1)[0] + "…"
    return ""


@dataclass
class Topico:
    nota: str
    titulo: str
    ordem: int | None
    resumo: str
    palavras: int


def _topico(vault: Path, arquivo: Path) -> Topico:
    post = frontmatter.load(arquivo)
    try:
        ordem = int(post.metadata["ordem"]) if post.metadata.get("ordem") is not None else None
    except (TypeError, ValueError):
        ordem = None
    return Topico(
        nota=arquivo.relative_to(vault).as_posix(),
        titulo=_titulo_md(post.content, arquivo.stem),
        ordem=ordem,
        resumo=_resumo_curto(re.sub(r"^#\s+.+$", "", post.content, count=1, flags=re.M)),
        palavras=len(re.findall(r"\w+", post.content)),
    )


def topicos(vault: Path, materia: str) -> list[Topico]:
    pasta = pasta_materia(vault, materia)
    itens = []
    for arquivo in sorted(pasta.rglob("*.md")):
        # `_index.md`, `_anotacoes/` (do usuário) e `_fontes/` (material enviado) não são tópicos
        if any(parte.startswith("_") for parte in arquivo.relative_to(pasta).parts):
            continue
        try:
            itens.append(_topico(vault, arquivo))
        except Exception:  # nota com frontmatter quebrado não derruba a tela
            continue
    return sorted(itens, key=lambda t: (t.ordem is None, t.ordem or 0, t.titulo))


def _indice(pasta: Path) -> tuple[dict, str]:
    arquivo = pasta / "_index.md"
    if not arquivo.is_file():
        return {}, ""
    try:
        post = frontmatter.load(arquivo)
        return dict(post.metadata), post.content
    except Exception:
        return {}, reader.ler_texto(arquivo)


def _resumo(vault: Path, pasta: Path) -> dict:
    materia = pasta.name
    _, conteudo = _indice(pasta)
    tops = topicos(vault, materia)
    return {
        "materia": materia,
        "titulo": _titulo_md(conteudo, materia),
        "topicos_total": len(tops),
        "anotacoes_total": len(listar_anotacoes(vault, materia)),
        "fontes_total": len(listar_fontes(vault, materia)),
        "titulos": [t.titulo for t in tops[:6]],
    }


def remover_materia(vault: Path, materia: str) -> dict:
    """Apaga a matéria inteira (tópicos, anotações do usuário e material enviado) e tira a linha dela
    de `wiki/estudos/_index.md`. Pedido explícito do usuário pelo HUD: é a única exclusão em lote do wiki."""
    pasta = pasta_materia(vault, materia)
    arquivos = [a for a in pasta.rglob("*") if a.is_file()]
    removido = {
        "materia": materia,
        "titulo": _titulo_md(_indice(pasta)[1], materia),
        "topicos": len(topicos(vault, materia)),
        "anotacoes": sum(1 for a in arquivos if ANOTACOES in a.relative_to(pasta).parts),
        "fontes": sum(1 for a in arquivos if FONTES in a.relative_to(pasta).parts),
        "arquivos": len(arquivos),
    }
    shutil.rmtree(pasta)
    indice = vault / ESTUDOS / "_index.md"
    if indice.is_file():
        texto = reader.ler_texto(indice)
        link = re.compile(rf"\[\[wiki/estudos/{re.escape(materia)}(/|\||\]\])")
        linhas = [linha for linha in texto.splitlines() if not link.search(linha)]
        if not any(re.search(r"\[\[wiki/estudos/[\w-]+", linha) for linha in linhas) and "_Nenhuma matéria ainda._" not in texto:
            linhas.append("_Nenhuma matéria ainda._")
        novo = "\n".join(linhas).rstrip() + "\n"
        if novo != texto:
            writer.escrever_atomico(indice, novo)
    return removido


def listar_materias(vault: Path) -> list[dict]:
    raiz = vault / ESTUDOS
    if not raiz.is_dir():
        return []
    return [_resumo(vault, p) for p in sorted(raiz.iterdir()) if p.is_dir() and not p.name.startswith(".")]


def detalhe(vault: Path, materia: str) -> dict:
    pasta = pasta_materia(vault, materia)
    _, conteudo = _indice(pasta)
    anotacoes = listar_anotacoes(vault, materia)
    return {
        **_resumo(vault, pasta),
        "indice": conteudo.strip(),
        "topicos": [
            {**asdict(t), "anotacoes": sum(1 for a in anotacoes if a["topico"] == t.nota)} for t in topicos(vault, materia)
        ],
        "anotacoes": [a for a in anotacoes if not a["topico"]],
        "fontes": listar_fontes(vault, materia),
    }


# ---------- anotações do usuário ----------
# Ficam em `wiki/estudos/<materia>/_anotacoes/`, uma por arquivo, com `topico:` apontando para a nota do
# tópico (ou vazio = anotação geral da matéria). São do usuário: a IA lê, mas não edita.

ANOTACOES = "_anotacoes"
FONTES = "_fontes"


def _pasta_anotacoes(vault: Path, materia: str) -> Path:
    return pasta_materia(vault, materia) / ANOTACOES


def _anotacao(vault: Path, arquivo: Path) -> dict:
    post = frontmatter.load(arquivo)
    meta = post.metadata
    return {
        "arquivo": arquivo.relative_to(vault).as_posix(),
        "titulo": str(meta.get("titulo") or "").strip() or None,
        "texto": post.content.strip(),
        "topico": meta.get("topico") or None,
        "origem": meta.get("origem") or None,
        "criado": str(meta.get("criado") or ""),
        "atualizado": str(meta.get("atualizado") or meta.get("criado") or ""),
    }


def listar_anotacoes(vault: Path, materia: str, topico: str | None = None) -> list[dict]:
    pasta = _pasta_anotacoes(vault, materia)
    if not pasta.is_dir():
        return []
    itens = []
    for arquivo in sorted(pasta.glob("*.md"), reverse=True):  # nome começa com a data: mais nova primeiro
        try:
            a = _anotacao(vault, arquivo)
        except Exception:
            continue
        if topico is None or a["topico"] == topico:
            itens.append(a)
    return itens


def _arquivo_anotacao(vault: Path, materia: str, arquivo: str) -> Path:
    pasta = _pasta_anotacoes(vault, materia).resolve()
    alvo = (vault / arquivo).resolve()
    if alvo.suffix != ".md" or alvo.parent != pasta or not alvo.is_file():
        raise CaminhoInvalido(arquivo)
    return alvo


def criar_anotacao(vault: Path, materia: str, texto: str, agora, titulo: str | None = None, topico: str | None = None,
                   origem: str | None = None) -> dict:
    if topico:
        nota_da_materia(vault, materia, topico)  # valida que o tópico é desta matéria
    pasta = _pasta_anotacoes(vault, materia)
    pasta.mkdir(exist_ok=True)
    base = f"{agora:%Y-%m-%d-%H%M%S}-{writer.slugify(titulo or texto.splitlines()[0][:40] or 'anotacao', 40)}"
    arquivo = pasta / f"{base}.md"
    n = 2
    while arquivo.exists():
        arquivo = pasta / f"{base}-{n}.md"
        n += 1
    post = frontmatter.Post(texto.strip(), tipo="anotacao", titulo=titulo or None, topico=topico or None,
                            origem=origem or None, criado=agora.isoformat(timespec="seconds"))
    post.metadata = {k: v for k, v in post.metadata.items() if v is not None}
    writer.escrever_atomico(arquivo, frontmatter.dumps(post, sort_keys=False) + "\n")
    return _anotacao(vault, arquivo)


def atualizar_anotacao(vault: Path, materia: str, arquivo: str, texto: str, agora, titulo: str | None = None) -> dict:
    alvo = _arquivo_anotacao(vault, materia, arquivo)
    post = frontmatter.load(alvo)
    post.content = texto.strip()
    if titulo is not None:
        post.metadata["titulo"] = titulo.strip() or None
        if not post.metadata["titulo"]:
            del post.metadata["titulo"]
    post.metadata["atualizado"] = agora.isoformat(timespec="seconds")
    writer.escrever_atomico(alvo, frontmatter.dumps(post, sort_keys=False) + "\n")
    return _anotacao(vault, alvo)


def remover_anotacao(vault: Path, materia: str, arquivo: str) -> None:
    _arquivo_anotacao(vault, materia, arquivo).unlink()


# ---------- material enviado (documentos e textos para o Gandalf estruturar) ----------

EXTENSOES_MATERIAL = {".pdf", ".md", ".txt", ".docx", ".png", ".jpg", ".jpeg", ".webp", ".csv", ".html"}


def _texto_docx(dados: bytes) -> str:
    """Texto de um .docx sem dependências (o Claude Code não lê .docx; lê o .md gerado ao lado)."""
    import io
    import zipfile
    from xml.etree import ElementTree

    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(dados)) as z:
        raiz = ElementTree.fromstring(z.read("word/document.xml"))
    paragrafos = ["".join(t.text or "" for t in p.iter(f"{ns}t")) for p in raiz.iter(f"{ns}p")]
    return "\n\n".join(p for p in paragrafos if p.strip())


def salvar_fonte(vault: Path, materia: str, nome: str, dados: bytes, agora) -> list[str]:
    """Guarda o material em `_fontes/` (nunca sobrescreve). .docx ganha um .md com o texto ao lado."""
    stem, ext = Path(nome).stem, Path(nome).suffix.lower()
    if ext not in EXTENSOES_MATERIAL:
        raise ValueError(f"formato não suportado: {ext or nome} (use PDF, texto, Markdown, Word ou imagem)")
    pasta = pasta_materia(vault, materia) / FONTES
    pasta.mkdir(exist_ok=True)
    base = f"{agora:%Y-%m-%d-%H%M%S}-{writer.slugify(stem, 50)}"
    arquivo = pasta / f"{base}{ext}"
    n = 2
    while arquivo.exists():
        arquivo = pasta / f"{base}-{n}{ext}"
        n += 1
    arquivo.write_bytes(dados)
    salvos = [arquivo.relative_to(vault).as_posix()]
    if ext == ".docx":
        try:
            md = arquivo.with_suffix(".md")
            md.write_text(f"# {stem}\n\n(texto extraído de {arquivo.name})\n\n{_texto_docx(dados)}\n", encoding="utf-8")
            salvos.append(md.relative_to(vault).as_posix())
        except Exception:
            pass  # .docx estranho: fica só o original
    return salvos


def listar_fontes(vault: Path, materia: str) -> list[dict]:
    pasta = pasta_materia(vault, materia) / FONTES
    if not pasta.is_dir():
        return []
    return [
        {"arquivo": a.relative_to(vault).as_posix(), "nome": a.name, "tamanho": a.stat().st_size}
        for a in sorted(pasta.iterdir(), reverse=True)
        if a.is_file()
    ]
