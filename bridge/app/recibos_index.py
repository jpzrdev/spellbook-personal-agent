"""Leitura dos recibos (só o frontmatter) para histórico, última execução e status."""

import re
from datetime import date, datetime
from pathlib import Path

import frontmatter


def _meses(desde: date, ate: date) -> list[tuple[int, int]]:
    meses = []
    ano, mes = desde.year, desde.month
    while (ano, mes) <= (ate.year, ate.month):
        meses.append((ano, mes))
        ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
    return meses


def ler_recibos(vault: Path, desde: date, ate: date) -> list[dict]:
    """Recibos entre as datas (inclusive), do mais antigo para o mais novo."""
    itens: list[dict] = []
    for ano, mes in _meses(desde, ate):
        pasta = vault / "recibos" / f"{ano:04d}" / f"{mes:02d}"
        if not pasta.is_dir():
            continue
        for arquivo in sorted(pasta.glob("*.md")):
            if arquivo.name.startswith(".tmp-"):  # escrita atômica em andamento
                continue
            dia = arquivo.name[:10]
            if not (desde.isoformat() <= dia <= ate.isoformat()):
                continue
            try:
                post = frontmatter.load(arquivo)
            except Exception:
                continue
            meta = post.metadata
            m = re.search(r"## Pedido\s*\n(.+)", post.content)
            pedido = m.group(1).strip()[:140] if m else ""
            quando = meta.get("quando")
            if isinstance(quando, str):
                try:
                    quando = datetime.fromisoformat(quando)
                except ValueError:
                    quando = None
            itens.append(
                {
                    "id": meta.get("id"),
                    "quando": quando,
                    "tier": int(meta.get("tier") or 0),
                    "origem": meta.get("origem"),
                    "intent": meta.get("intent"),
                    "rotina": meta.get("rotina"),
                    "status": meta.get("status") or "ok",
                    "modelo": meta.get("modelo"),
                    "tokens_entrada": int(meta.get("tokens_entrada") or 0),
                    "tokens_saida": int(meta.get("tokens_saida") or 0),
                    "custo_estimado_usd": float(meta.get("custo_estimado_usd") or 0),
                    "duracao_ms": int(meta.get("duracao_ms") or 0),
                    "arquivo": arquivo.relative_to(vault).as_posix(),
                    "pedido": pedido,
                }
            )
    return sorted(itens, key=lambda r: r["quando"].isoformat() if r["quando"] else "")


def para_json(recibo: dict) -> dict:
    return {**recibo, "quando": recibo["quando"].isoformat(timespec="seconds") if recibo["quando"] else None}


def custos_por_dia(recibos: list[dict]) -> list[dict]:
    """Soma por dia: chamadas por tier, tokens e custo equivalente em API (referência)."""
    dias: dict[str, dict] = {}
    for r in recibos:
        if not r["quando"]:
            continue
        dia = r["quando"].date().isoformat()
        d = dias.setdefault(
            dia,
            {"dia": dia, "chamadas": {"1": 0, "2": 0, "3": 0}, "tokens_entrada": 0, "tokens_saida": 0, "custo_estimado_usd": 0.0},
        )
        tier = str(r["tier"]) if r["tier"] in (1, 2, 3) else "1"
        d["chamadas"][tier] += 1
        d["tokens_entrada"] += r["tokens_entrada"]
        d["tokens_saida"] += r["tokens_saida"]
        d["custo_estimado_usd"] += r["custo_estimado_usd"]
    for d in dias.values():
        d["custo_estimado_usd"] = round(d["custo_estimado_usd"], 4)
    return [dias[k] for k in sorted(dias)]
