"""Roteador do Gandalf: decide o tier de cada pedido e grava o recibo.

Tier 1 (regras, sem IA) → Tier 2 (Claude Code rápido, decide responder ou escalar)
→ Tier 3 (sessão do Claude Code em segundo plano). Um recibo por pedido: o Tier 3 grava o
seu ao terminar, somando os tokens do Tier 2 que o escalou.
"""

import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import frontmatter

from app import clock
from app.config import get_settings
from app import biblioteca
from app.gandalf import tier1, tier2, tier3, triagem
from app.receipts import Recibo, gravar_recibo

NAO_ENTENDI_TIER1 = (
    "Esse pedido não está nos meus feitiços rápidos, amigo. Os que conheço de cor: "
    "\"o que tenho hoje/amanhã?\", \"minhas prioridades\", \"minhas tarefas\", "
    "\"adiciona tarefa …\", \"anota …\", \"me lembra de … em 30 min\", \"meus lembretes\" e \"minhas rotinas\"."
)


@dataclass
class RespostaGandalf:
    id: str | None
    tier: int
    intent: str | None
    entendeu: bool
    resposta: str
    duracao_ms: int
    dados: dict = field(default_factory=dict)
    sessao_id: str | None = None
    precisa_confirmar: bool = False


def chamadas_ia_hoje(vault: Path, dia: date) -> int:
    """Recibos de hoje com tier 2 ou 3 (para o limite diário)."""
    pasta = vault / "recibos" / f"{dia:%Y}" / f"{dia:%m}"
    total = 0
    for arquivo in pasta.glob(f"{dia.isoformat()}-*.md"):
        try:
            if int(frontmatter.load(arquivo).get("tier") or 0) >= 2:
                total += 1
        except Exception:
            continue
    return total


def perguntar(
    vault: Path,
    texto: str,
    origem: str = "hud",
    forcar_tier: int | None = None,
    confirmar: bool = False,
    anterior: list[dict] | None = None,
    nota: tuple[str, str] | None = None,
) -> RespostaGandalf:
    inicio = time.perf_counter()
    agora = clock.now()

    def ms() -> int:
        return round((time.perf_counter() - inicio) * 1000)

    # ---------- Tier 1 ----------
    if forcar_tier in (None, 1) and not nota:  # pergunta sobre uma nota: direto para a IA
        ctx = tier1.Contexto(vault=vault, agora=agora, tz=clock.tz(), origem=origem)
        r = tier1.responder(texto, ctx)
        if r or forcar_tier == 1:
            resposta = r.texto if r else NAO_ENTENDI_TIER1
            duracao = ms()
            rid, _ = gravar_recibo(
                vault,
                Recibo(texto, resposta, origem, 1, agora, duracao, intent=r.intent if r else "nao_entendido"),
            )
            return RespostaGandalf(rid, 1, r.intent if r else None, r is not None, resposta, duracao, r.dados if r else {})

    # ---------- limite diário de IA ----------
    limite = get_settings().limite_diario_chamadas
    if not confirmar and limite > 0:
        feitas = chamadas_ia_hoje(vault, agora.date())
        if feitas >= limite:
            return RespostaGandalf(
                None, 0, None, False,
                f"Você já usou {feitas} chamadas de IA hoje (limite {limite}). Confirme para continuar.",
                ms(), {"feitas": feitas, "limite": limite}, precisa_confirmar=True,
            )

    gerenciador = tier3.gerenciador(vault)

    # ---------- Tier 3 direto ----------
    if forcar_tier == 3:
        s = gerenciador.criar(texto, origem=origem)
        return RespostaGandalf(None, 3, "claude_code", True, "Abri uma sessão do Claude Code para isso.", ms(), sessao_id=s.id)

    # ---------- Tier 2 ----------
    d = tier2.decidir(vault, texto, agora, anterior, nota)
    if d.acao == "escalar":
        s = gerenciador.criar(
            d.tarefa + (f"\n\n(A pergunta é sobre a nota `{nota[0]}`.)" if nota else ""),
            pedido=texto,
            origem=origem,
            skill=d.skill,
            tokens_previos=(d.tokens_entrada, d.tokens_saida, d.custo_usd),
        )
        motivo = d.motivo or "Isso precisa de trabalho no vault; abri uma sessão do Claude Code."
        return RespostaGandalf(
            None, 3, f"skill:{d.skill}" if d.skill else "claude_code", True, motivo, ms(),
            {"tarefa": d.tarefa, "skill": d.skill}, sessao_id=s.id,
        )

    if d.acao == "pesquisar":
        p = d.pesquisa or {}
        tarefa = p["consulta"]
        if p.get("atualizar"):
            try:
                guardado = biblioteca.contexto_para_atualizar(vault, p["atualizar"])
                tarefa += (
                    "\n\nO usuário já tem um material guardado sobre isso (abaixo). Pesquise o que falta ou mudou "
                    "e entregue só o que é novo ou corrigido, dizendo o que mudou.\n\n<ja_guardado>\n"
                    + guardado + "\n</ja_guardado>"
                )
            except (FileNotFoundError, biblioteca.TemaInvalido):
                p["atualizar"] = None
        s = gerenciador.criar(
            tarefa,
            pedido=texto,
            origem=origem,
            skill="pesquisar",
            saida="pesquisa",
            pesquisa={"tema": p["tema"], "tipo": p["tipo"], "pedido": texto, "slug": p.get("atualizar")},
            tokens_previos=(d.tokens_entrada, d.tokens_saida, d.custo_usd),
        )
        resposta = (
            f"Vou pesquisar na web: **{p['tema']}**. Quando terminar, o resultado aparece aqui"
            " e você decide se guarda no vault."
        )
        return RespostaGandalf(None, 3, "pesquisar", True, resposta, ms(), {"pesquisa": {**p}}, sessao_id=s.id)

    if d.acao == "capturar":
        resposta, dados = triagem.executar(vault, clock.tz(), d.itens, agora, texto, origem)
        duracao = ms()
        rid, _ = gravar_recibo(
            vault,
            Recibo(
                texto, resposta, origem, 2, agora, duracao,
                intent="capturar", modelo=d.modelo,
                tokens_entrada=d.tokens_entrada, tokens_saida=d.tokens_saida,
                custo_estimado_usd=round(d.custo_usd, 6),
            ),
        )
        return RespostaGandalf(rid, 2, "capturar", True, resposta, duracao, dados)

    duracao = ms()
    rid, _ = gravar_recibo(
        vault,
        Recibo(
            texto, d.resposta, origem, 2, agora, duracao,
            intent="responder", modelo=d.modelo,
            tokens_entrada=d.tokens_entrada, tokens_saida=d.tokens_saida,
            custo_estimado_usd=round(d.custo_usd, 6),
        ),
    )
    return RespostaGandalf(rid, 2, "responder", True, d.resposta, duracao, {"avisos": d.avisos} if d.avisos else {})
