"""Status das rotinas: execuções de hoje (recibos + sessões em andamento) e histórico."""

from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from app import cron
from app.gandalf import tier3
from app.recibos_index import ler_recibos
from app.vault.reader import ler_rotinas

# Uma execução conta para um horário agendado se começou até 2 min antes dele (relógios, atraso).
TOLERANCIA = timedelta(minutes=2)


def execucoes(vault: Path, desde: datetime, ate: datetime) -> dict[str, list[dict]]:
    """Por slug: execuções (recibos com `rotina` + sessões ainda ativas), da mais antiga à mais nova."""
    por_slug: dict[str, list[dict]] = {}
    for r in ler_recibos(vault, desde.date(), ate.date()):
        if r["rotina"] and r["quando"] and desde <= r["quando"] <= ate:
            por_slug.setdefault(r["rotina"], []).append(
                {"quando": r["quando"], "status": r["status"], "recibo_id": r["id"], "tier": r["tier"]}
            )
    for s in tier3.gerenciador(vault).listar():
        if s.rotina and s.status in tier3.ATIVAS:
            por_slug.setdefault(s.rotina, []).append(
                {"quando": s.criada, "status": "rodando" if s.status == "rodando" else "fila", "sessao_id": s.id}
            )
    for lista in por_slug.values():
        lista.sort(key=lambda e: e["quando"])
    return por_slug


def rotinas_do_dia(vault: Path, agora: datetime, tz: ZoneInfo) -> list[dict]:
    """Disparos de hoje das rotinas ativas com status: pendente | passou | fila | rodando | ok | erro…"""
    inicio_dia = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    feitas = execucoes(vault, inicio_dia, agora + timedelta(days=1))
    itens: list[dict] = []
    for r in ler_rotinas(vault):
        if not r.ativa:
            continue
        try:
            disparos = cron.horarios_no_dia(r.cron, agora.date(), tz)
        except ValueError:
            continue
        execs = feitas.get(r.slug, [])
        for i, d in enumerate(disparos):
            proximo = disparos[i + 1] if i + 1 < len(disparos) else inicio_dia + timedelta(days=2)
            # Execução deste horário: a primeira entre (horário − tolerância) e o próximo horário.
            exec_ = next((e for e in execs if d - TOLERANCIA <= e["quando"] < proximo - TOLERANCIA), None)
            status = exec_["status"] if exec_ else ("pendente" if d > agora else "passou")
            item = {"slug": r.slug, "nome": r.nome, "horario": d.strftime("%H:%M"), "quando": r.quando, "status": status}
            if exec_:
                item.update({k: exec_[k] for k in ("recibo_id", "sessao_id") if k in exec_})
            itens.append(item)
    return sorted(itens, key=lambda i: i["horario"])


def historico(vault: Path, agora: datetime, dias: int = 30) -> dict[str, list[dict]]:
    return execucoes(vault, agora - timedelta(days=dias), agora + timedelta(minutes=1))
