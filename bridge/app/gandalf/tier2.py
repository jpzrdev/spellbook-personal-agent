"""Tier 2 do Gandalf: um modelo rápido (via Claude Code, sem ferramentas) decide responder ou escalar."""

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from app.config import get_settings
from app.gandalf import claude_cli
from app.gandalf.contexto import montar_contexto

PROMPTS = Path(__file__).parent / "prompts"
# Personalidade (editável) + regras de decisão do Tier 2. Texto estável ajuda o cache do Claude Code.
ARQUIVOS_PROMPT = ("personalidade.md", "manual.md", "tier2.md")

ITEM = {
    "type": "object",
    "properties": {
        "tipo": {"type": "string", "enum": ["lembrete", "evento", "tarefa", "nota"]},
        "texto": {"type": "string"},
        "quando": {"type": "string"},
        "hora": {"type": "string"},
        "dias_semana": {"type": "array", "items": {"type": "integer"}},
        "vence": {"type": "string"},
        "prioridade": {"type": "string"},
        "titulo": {"type": "string"},
        "data": {"type": "string"},
        "dia_inteiro": {"type": "boolean"},
        "hora_inicio": {"type": "string"},
        "hora_fim": {"type": "string"},
        "repetir": {"type": ["string", "null"]},
        "avisos_min": {"type": "array", "items": {"type": "integer"}},
        "local": {"type": "string"},
    },
    "required": ["tipo"],
}

ESQUEMA = {
    "type": "object",
    "properties": {
        "acao": {"type": "string", "enum": ["responder", "escalar", "capturar", "pesquisar"]},
        "resposta": {"type": "string"},
        "motivo": {"type": "string"},
        "tarefa": {"type": "string"},
        "skill": {"type": ["string", "null"]},
        "itens": {"type": "array", "items": ITEM},
        "tema": {"type": "string"},
        "consulta": {"type": "string"},
        "tipo": {"type": "string", "enum": ["pesquisa", "plano"]},
        "atualizar": {"type": ["string", "null"]},
    },
    "required": ["acao"],
}


@dataclass
class Decisao:
    acao: str  # responder | escalar | capturar | pesquisar
    resposta: str = ""
    motivo: str = ""
    tarefa: str = ""
    skill: str | None = None
    itens: list[dict] = field(default_factory=list)
    pesquisa: dict | None = None  # {tema, consulta, tipo, atualizar}
    modelo: str | None = None
    tokens_entrada: int = 0
    tokens_saida: int = 0
    custo_usd: float = 0.0
    tentativas: int = 1
    avisos: list[str] = field(default_factory=list)


def _extrair_json(texto: str) -> dict | None:
    """Aceita o JSON puro ou dentro de um bloco ```json```."""
    texto = texto.strip()
    if m := re.search(r"```(?:json)?\s*(\{.*?\})\s*```", texto, re.S):
        texto = m.group(1)
    elif not texto.startswith("{") and (m := re.search(r"\{.*\}", texto, re.S)):
        texto = m.group(0)
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError:
        return None
    return dados if isinstance(dados, dict) else None


def _valida(dados: dict | None) -> bool:
    if not dados:
        return False
    if dados.get("acao") == "responder":
        return bool(str(dados.get("resposta") or "").strip())
    if dados.get("acao") == "escalar":
        return bool(str(dados.get("tarefa") or "").strip())
    if dados.get("acao") == "pesquisar":
        return bool(str(dados.get("consulta") or "").strip())
    if dados.get("acao") == "capturar":
        itens = dados.get("itens")
        return isinstance(itens, list) and bool(itens) and all(isinstance(i, dict) and i.get("tipo") for i in itens)
    return False


def prompt_sistema() -> str:
    return "\n\n".join((PROMPTS / a).read_text(encoding="utf-8").strip() for a in ARQUIVOS_PROMPT)


def _args() -> list[str]:
    return [
        "--model", get_settings().tier2_model,
        "--tools", "",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--system-prompt", prompt_sistema(),
        "--json-schema", json.dumps(ESQUEMA, ensure_ascii=False),
    ]


def decidir(vault: Path, pedido: str, agora: datetime, anterior: list[dict] | None = None,
            nota: tuple[str, str] | None = None) -> Decisao:
    """`anterior`: últimas trocas da conversa ({pergunta, resposta}), para entender respostas curtas
    como "amanhã às 9" depois de o Gandalf perguntar "quando?"."""
    contexto = montar_contexto(vault, agora)
    prompt = f"<contexto>\n{contexto}\n</contexto>\n\n"
    if anterior:
        trocas = "\n\n".join(f"Usuário: {t['pergunta'].strip()}\nGandalf: {t['resposta'].strip()}" for t in anterior)
        prompt += f"<conversa_anterior>\n{trocas}\n</conversa_anterior>\n\n"
    if nota:
        caminho, texto = nota
        prompt += f'<nota_em_estudo caminho="{caminho}">\n{texto[:8000]}\n</nota_em_estudo>\n\n'
    prompt += f"<pedido>\n{pedido.strip()}\n</pedido>"

    total_in = total_out = 0
    custo = 0.0
    ultimo = None
    for tentativa in (1, 2):  # JSON inválido: tenta mais uma vez
        r = claude_cli.rodar_json(prompt, _args(), cwd=vault)
        total_in += r.tokens_entrada
        total_out += r.tokens_saida
        custo += r.custo_usd
        ultimo = r
        dados = r.estruturado if _valida(r.estruturado) else _extrair_json(r.texto)
        if _valida(dados):
            skill = dados.get("skill")
            return Decisao(
                acao=dados["acao"],
                resposta=str(dados.get("resposta") or "").strip(),
                motivo=str(dados.get("motivo") or "").strip(),
                tarefa=str(dados.get("tarefa") or "").strip(),
                skill=skill if isinstance(skill, str) and skill.strip() and skill != "null" else None,
                itens=(dados.get("itens") or []) if dados["acao"] == "capturar" else [],
                pesquisa={
                    "tema": str(dados.get("tema") or "").strip()[:80] or "Pesquisa",
                    "consulta": str(dados.get("consulta")).strip(),
                    "tipo": "plano" if dados.get("tipo") == "plano" else "pesquisa",
                    "atualizar": (str(dados["atualizar"]).strip() or None) if dados.get("atualizar") else None,
                } if dados["acao"] == "pesquisar" else None,
                modelo=r.modelo,
                tokens_entrada=total_in,
                tokens_saida=total_out,
                custo_usd=custo,
                tentativas=tentativa,
            )

    # Depois de 2 tentativas, trata como resposta com o texto bruto.
    assert ultimo is not None
    return Decisao(
        acao="responder",
        resposta=ultimo.texto.strip() or "Não consegui formular uma resposta agora.",
        modelo=ultimo.modelo,
        tokens_entrada=total_in,
        tokens_saida=total_out,
        custo_usd=custo,
        tentativas=2,
        avisos=["JSON inválido do Tier 2; usada a resposta bruta"],
    )
