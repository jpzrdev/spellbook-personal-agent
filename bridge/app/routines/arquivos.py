"""Criar, editar e remover notas de rotina em vida/rotinas/ (frontmatter + descrição)."""

from pathlib import Path

import frontmatter
import yaml

from app import clock, cron
from app.routines.acoes import ACOES
from app.vault.reader import ROTINAS, ler_texto
from app.vault.writer import escrever_atomico, slugify


class RotinaInvalida(ValueError):
    pass


class RotinaExiste(Exception):
    pass


class RotinaNaoEncontrada(Exception):
    pass


ORDEM = ["tipo", "nome", "cron", "ativa", "tier", "skill", "acao", "saida", "notificar", "criada"]


class _Aspas(str):
    """String que o YAML grava entre aspas (o cron fica legível e nunca vira outro tipo)."""


yaml.SafeDumper.add_representer(_Aspas, lambda d, v: d.represent_scalar("tag:yaml.org,2002:str", v, style='"'))


def caminho(vault: Path, slug: str) -> Path:
    if slugify(slug) != slug:
        raise RotinaNaoEncontrada(slug)
    return vault / ROTINAS / f"{slug}.md"


def validar(meta: dict, tz) -> None:
    try:
        cron.criar_trigger(str(meta.get("cron", "")), tz)
    except (ValueError, TypeError) as e:
        raise RotinaInvalida(f"horário (cron) inválido: {meta.get('cron')!r}") from e
    if meta.get("saida") not in (None, "vault", "efemera"):
        raise RotinaInvalida("saida deve ser 'vault' ou 'efemera'")
    tier = meta.get("tier")
    if tier == 1:
        if meta.get("acao") not in ACOES:
            raise RotinaInvalida(f"rotina interna precisa de uma ação válida: {', '.join(ACOES)}")
    elif tier == 3:
        pass  # skill opcional: sem skill, a descrição vira a tarefa do Claude Code
    else:
        raise RotinaInvalida("tier deve ser 1 (ação interna) ou 3 (Claude Code)")


def _escrever(arquivo: Path, meta: dict, descricao: str) -> None:
    meta = {k: meta[k] for k in ORDEM if meta.get(k) is not None} | {
        k: v for k, v in meta.items() if k not in ORDEM and v is not None
    }
    if meta.get("cron") is not None:
        meta["cron"] = _Aspas(meta["cron"])
    cabecalho = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)
    escrever_atomico(arquivo, f"---\n{cabecalho}---\n{descricao.strip()}\n")


def criar(vault: Path, tz, *, nome: str, cron_expr: str, tier: int, ativa: bool,
          skill: str | None, acao: str | None, descricao: str, saida: str = "vault", notificar: bool = False) -> str:
    slug = slugify(nome)
    arquivo = caminho(vault, slug)
    if arquivo.exists():
        raise RotinaExiste(slug)
    meta = {"tipo": "rotina", "nome": nome.strip(), "cron": cron_expr.strip(), "ativa": ativa, "tier": tier,
            "skill": skill or None, "acao": acao or None,
            # "vault" é o padrão: só gravamos o campo quando a saída é efêmera.
            "saida": "efemera" if saida == "efemera" else None,
            "notificar": True if notificar else None,
            # Data de criação: rotinas atrasadas não recuperam horários anteriores a ela.
            "criada": clock.now().isoformat(timespec="seconds")}
    validar(meta, tz)
    _escrever(arquivo, meta, descricao)
    return slug


def atualizar(vault: Path, tz, slug: str, mudancas: dict, descricao: str | None = None) -> None:
    """Muda só os campos informados; preserva campos desconhecidos e o corpo da nota."""
    arquivo = caminho(vault, slug)
    if not arquivo.is_file():
        raise RotinaNaoEncontrada(slug)
    post = frontmatter.loads(ler_texto(arquivo))
    meta = dict(post.metadata)
    for chave, valor in mudancas.items():
        if chave == "cron_expr":
            chave = "cron"
        if (chave == "saida" and valor == "vault") or (chave == "notificar" and not valor):
            valor = None  # padrões não são gravados
        meta[chave] = valor if valor != "" else None
    validar(meta, tz)
    _escrever(arquivo, meta, descricao if descricao is not None else post.content)


def remover(vault: Path, slug: str) -> None:
    arquivo = caminho(vault, slug)
    if not arquivo.is_file():
        raise RotinaNaoEncontrada(slug)
    arquivo.unlink()
