"""Recibos: um arquivo markdown por pedido em recibos/AAAA/MM/ (nunca editados depois)."""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import yaml
from ulid import ULID

from app.vault.writer import escrever_atomico, slugify


@dataclass
class Recibo:
    pedido: str
    resposta: str
    origem: str  # hud | obsidian | voz | rotina
    tier: int
    quando: datetime
    duracao_ms: int
    intent: str | None = None
    modelo: str | None = None
    tokens_entrada: int = 0
    tokens_saida: int = 0
    custo_estimado_usd: float = 0.0
    sessao_claude_code: str | None = None
    rotina: str | None = None  # slug da rotina que disparou (origem: rotina)
    status: str = "ok"  # ok | erro | cancelada | tempo_esgotado


def gravar_recibo(vault: Path, r: Recibo) -> tuple[str, Path]:
    """Grava o recibo e devolve (id, caminho)."""
    rid = str(ULID.from_datetime(r.quando))
    pasta = vault / "recibos" / f"{r.quando:%Y}" / f"{r.quando:%m}"
    base = f"{r.quando:%Y-%m-%d-%H%M%S}-{slugify(r.pedido, 40)}"
    caminho = pasta / f"{base}.md"
    if caminho.exists():
        caminho = pasta / f"{base}-{rid[-6:].lower()}.md"

    meta = {
        "tipo": "recibo",
        "id": rid,
        "quando": r.quando.isoformat(timespec="seconds"),
        "origem": r.origem,
        "tier": r.tier,
        "intent": r.intent,
        "modelo": r.modelo,
        "duracao_ms": r.duracao_ms,
        "tokens_entrada": r.tokens_entrada,
        "tokens_saida": r.tokens_saida,
        "custo_estimado_usd": r.custo_estimado_usd,
        "sessao_claude_code": r.sessao_claude_code,
        "rotina": r.rotina,
        "status": r.status,
    }
    cabecalho = yaml.safe_dump(meta, allow_unicode=True, sort_keys=False)
    conteudo = f"---\n{cabecalho}---\n## Pedido\n{r.pedido.strip()}\n\n## Resposta\n{r.resposta.strip()}\n"
    escrever_atomico(caminho, conteudo)
    return rid, caminho
