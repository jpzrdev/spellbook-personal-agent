"""Estudos: matérias de wiki/estudos/<materia>/, tópicos, progresso, flashcards e repetição espaçada.

Cada nota de tópico guarda no frontmatter o próprio estado de estudo (mantido pelo HUD e pelas skills):
- `estado`: novo | estudado | dominado
- `revisar`: AAAA-MM-DD da próxima revisão; `intervalo`: dias até ela; `revisoes`: quantas já feitas
- `ordem`: posição no cronograma (opcional)
As perguntas dos flashcards vêm do próprio texto da nota: item numerado seguido de um callout recolhido
(`> [!note]- Resposta`), o formato que as skills `preparar-estudos` e `revisar-estudos` escrevem.
"""

import re
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path

import frontmatter

from app.vault import reader, writer

ESTUDOS = Path("wiki/estudos")
REVISOES = Path("output/revisoes")
NIVEIS = ("errei", "dificil", "facil")
DOMINADO_DIAS = 21  # intervalo a partir do qual o tópico conta como dominado


class CaminhoInvalido(ValueError):
    pass


def _data(valor) -> date | None:
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor)[:10]) if valor else None
    except ValueError:
        return None


def _norm(texto: str) -> str:
    sem = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", sem).strip()


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


# ---------- tópicos e perguntas ----------

PERGUNTA_RE = re.compile(r"^\s*(?:\d+[.)]|[-*])\s+(?P<texto>.*\S)\s*$")
CALLOUT_RE = re.compile(r"^\s*>\s*\[!\w+\][-+]?")


def perguntas(conteudo: str) -> list[dict]:
    """Pares pergunta/resposta: item de lista seguido de callout (`> [!note]- Resposta`)."""
    linhas = conteudo.splitlines()
    pares = []
    i = 0
    while i < len(linhas):
        m = PERGUNTA_RE.match(linhas[i])
        j = i + 1
        while j < len(linhas) and not linhas[j].strip():
            j += 1
        if m and j < len(linhas) and CALLOUT_RE.match(linhas[j]):
            resposta = []
            k = j + 1
            while k < len(linhas) and linhas[k].lstrip().startswith(">"):
                resposta.append(re.sub(r"^\s*>\s?", "", linhas[k]))
                k += 1
            pergunta = re.sub(r"\*\*(.+?)\*\*", r"\1", m.group("texto"))
            if resposta and pergunta:
                pares.append({"pergunta": pergunta, "resposta": "\n".join(resposta).strip()})
            i = k
            continue
        i += 1
    return pares


@dataclass
class Topico:
    nota: str
    titulo: str
    estado: str
    revisar: str | None
    intervalo: int
    revisoes: int
    perguntas: int
    ordem: int | None


def _topico(vault: Path, arquivo: Path) -> Topico:
    post = frontmatter.load(arquivo)
    meta = post.metadata
    estado = meta.get("estado") if meta.get("estado") in ("novo", "estudado", "dominado") else (
        "estudado" if meta.get("revisar") else "novo")
    revisar = _data(meta.get("revisar"))
    try:
        ordem = int(meta["ordem"]) if meta.get("ordem") is not None else None
    except (TypeError, ValueError):
        ordem = None
    return Topico(
        nota=arquivo.relative_to(vault).as_posix(),
        titulo=_titulo_md(post.content, arquivo.stem),
        estado=estado,
        revisar=revisar.isoformat() if revisar else None,
        intervalo=int(meta.get("intervalo") or 0),
        revisoes=int(meta.get("revisoes") or 0),
        perguntas=len(perguntas(post.content)),
        ordem=ordem,
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


def _tarefas_da_materia(vault: Path, materia: str):
    return [t for t in reader.ler_tarefas(vault) if any(tag == f"estudos/{materia}" or tag.startswith(f"estudos/{materia}/") for tag in t.tags)]


def _indice(pasta: Path) -> tuple[dict, str]:
    arquivo = pasta / "_index.md"
    if not arquivo.is_file():
        return {}, ""
    try:
        post = frontmatter.load(arquivo)
        return dict(post.metadata), post.content
    except Exception:
        return {}, reader.ler_texto(arquivo)


def _resumo(vault: Path, pasta: Path, hoje: date) -> dict:
    from app.gandalf.tier1 import tarefa_dict

    materia = pasta.name
    meta, conteudo = _indice(pasta)
    tops = topicos(vault, materia)
    pendentes = [t for t in tops if t.revisar and t.revisar <= hoje.isoformat()]
    futuras = sorted(t.revisar for t in tops if t.revisar and t.revisar > hoje.isoformat())
    abertas = sorted((t for t in _tarefas_da_materia(vault, materia) if not t.concluida),
                     key=lambda t: (t.vence is None, t.vence or date.max))
    revisoes = sorted((vault / REVISOES).glob(f"*{materia}*.md")) if (vault / REVISOES).is_dir() else []
    prazo = _data(meta.get("prazo"))
    return {
        "materia": materia,
        "titulo": _titulo_md(conteudo, materia),
        "prazo": prazo.isoformat() if prazo else None,
        "notas": len(tops),
        "progresso": {
            "total": len(tops),
            "estudados": sum(1 for t in tops if t.estado in ("estudado", "dominado")),
            "dominados": sum(1 for t in tops if t.estado == "dominado"),
        },
        "pendentes": [{"nota": t.nota, "titulo": t.titulo, "desde": t.revisar} for t in sorted(pendentes, key=lambda t: t.revisar)],
        "proxima_revisao": futuras[0] if futuras else None,
        "proxima_tarefa": tarefa_dict(abertas[0]) if abertas else None,
        "revisoes_feitas": sum(t.revisoes for t in tops) + len(revisoes),
        "ultima_revisao": revisoes[-1].relative_to(vault).as_posix() if revisoes else None,
    }


def listar_materias(vault: Path, hoje: date) -> list[dict]:
    raiz = vault / ESTUDOS
    if not raiz.is_dir():
        return []
    return [_resumo(vault, p, hoje) for p in sorted(raiz.iterdir()) if p.is_dir() and not p.name.startswith(".")]


def detalhe(vault: Path, materia: str, hoje: date) -> dict:
    from app.gandalf.tier1 import tarefa_dict

    pasta = pasta_materia(vault, materia)
    _, conteudo = _indice(pasta)
    tarefas = sorted(_tarefas_da_materia(vault, materia), key=lambda t: (t.concluida, t.vence is None, t.vence or date.max))
    anotacoes = listar_anotacoes(vault, materia)
    return {
        **_resumo(vault, pasta, hoje),
        "hoje": hoje.isoformat(),
        "indice": conteudo.strip(),
        "topicos": [
            {**asdict(t), "anotacoes": sum(1 for a in anotacoes if a["topico"] == t.nota)} for t in topicos(vault, materia)
        ],
        "anotacoes": [a for a in anotacoes if not a["topico"]],
        "fontes": listar_fontes(vault, materia),
        "tarefas": [tarefa_dict(t) for t in tarefas if not t.concluida or t.concluida_em == hoje],
    }


# ---------- estudo e revisão ----------

def _gravar_meta(arquivo: Path, mudar) -> None:
    post = frontmatter.load(arquivo)
    mudar(post.metadata)
    writer.escrever_atomico(arquivo, frontmatter.dumps(post, sort_keys=False) + "\n")


def marcar_estudado(vault: Path, materia: str, nota: str, hoje: date) -> dict:
    """Tópico lido: vira "estudado", primeira revisão amanhã e a tarefa de estudo dele é concluída."""
    arquivo = nota_da_materia(vault, materia, nota)

    def mudar(meta):
        if meta.get("estado") not in ("estudado", "dominado"):
            meta["estado"] = "estudado"
            meta["estudado_em"] = hoje
            meta["intervalo"] = 1
            meta["revisar"] = hoje + timedelta(days=1)

    _gravar_meta(arquivo, mudar)
    topico = _topico(vault, arquivo)
    concluidas = []
    alvo = _norm(topico.titulo)
    for t in _tarefas_da_materia(vault, materia):
        if not t.concluida and alvo and alvo in _norm(t.texto):
            concluidas.append(writer.atualizar_tarefa(vault, t.id, hoje, concluida=True).texto)
    return {"topico": asdict(topico), "tarefas_concluidas": concluidas}


def proximo_intervalo(atual: int, nivel: str) -> int:
    """Repetição espaçada simples por tópico: errou volta amanhã; difícil cresce pouco; fácil cresce muito."""
    if nivel == "errei":
        return 1
    if nivel == "dificil":
        return max(2, round(atual * 1.3)) if atual else 2
    return max(4, round(atual * 2.5)) if atual else 4


def registrar_revisao(vault: Path, materia: str, nota: str, nivel: str, hoje: date) -> dict:
    if nivel not in NIVEIS:
        raise ValueError(f"nível inválido: {nivel}")
    arquivo = nota_da_materia(vault, materia, nota)

    def mudar(meta):
        novo = proximo_intervalo(int(meta.get("intervalo") or 0), nivel)
        meta["intervalo"] = novo
        meta["revisar"] = hoje + timedelta(days=novo)
        meta["revisoes"] = int(meta.get("revisoes") or 0) + 1
        meta["ultima_revisao"] = hoje
        meta["estado"] = "dominado" if novo >= DOMINADO_DIAS else "estudado"

    _gravar_meta(arquivo, mudar)
    return asdict(_topico(vault, arquivo))


def cartas(vault: Path, materia: str, hoje: date, nota: str | None = None, todas: bool = False) -> list[dict]:
    """Flashcards: de uma nota, das notas com revisão vencida ou (todas=True) de todas as já estudadas."""
    if nota:
        arquivos = [nota_da_materia(vault, materia, nota)]
    else:
        tops = topicos(vault, materia)
        if todas:
            escolhidos = [t for t in tops if t.estado != "novo"] or tops
        else:
            escolhidos = [t for t in tops if t.revisar and t.revisar <= hoje.isoformat()]
        arquivos = [vault / t.nota for t in escolhidos]
    saida = []
    for arquivo in arquivos:
        post = frontmatter.load(arquivo)
        titulo = _titulo_md(post.content, arquivo.stem)
        for i, p in enumerate(perguntas(post.content)):
            saida.append({"id": f"{arquivo.relative_to(vault).as_posix()}#{i}", "nota": arquivo.relative_to(vault).as_posix(), "titulo": titulo, **p})
    return saida


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


def criar_anotacao(vault: Path, materia: str, texto: str, agora, titulo: str | None = None, topico: str | None = None) -> dict:
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
                            criado=agora.isoformat(timespec="seconds"))
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
