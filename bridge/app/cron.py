"""Expressões cron das rotinas: horários de um dia e descrição em português."""

import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from apscheduler.triggers.cron import CronTrigger

DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
_NOMES_EN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def criar_trigger(expr: str, tz: ZoneInfo) -> CronTrigger:
    """CronTrigger com semântica de cron padrão (0 = domingo).

    `CronTrigger.from_crontab` do APScheduler 3.x trata o dia da semana numérico com
    0 = segunda, então '1-5' viraria ter–sáb. Convertemos os números para nomes.
    """
    minuto, hora, dia_mes, mes, dia_semana = expr.split()
    dia_semana = re.sub(r"(?<!/)\b([0-7])\b", lambda m: _NOMES_EN[int(m.group(1))], dia_semana)
    return CronTrigger(
        minute=minuto, hour=hora, day=dia_mes, month=mes, day_of_week=dia_semana, timezone=tz
    )


def horarios_no_dia(expr: str, dia: date, tz: ZoneInfo) -> list[datetime]:
    """Todos os disparos da expressão dentro do dia (no fuso dado)."""
    trigger = criar_trigger(expr, tz)
    inicio = datetime.combine(dia, time.min, tz)
    fim = inicio + timedelta(days=1)
    disparos: list[datetime] = []
    anterior = None
    atual = trigger.get_next_fire_time(None, inicio - timedelta(microseconds=1))
    while atual and atual < fim:
        disparos.append(atual)
        anterior = atual
        atual = trigger.get_next_fire_time(anterior, atual + timedelta(seconds=1))
    return disparos


def _dias_semana(campo: str) -> str | None:
    if campo == "*":
        return "todo dia"
    if campo in ("1-5", "mon-fri"):
        return "seg–sex"
    if campo in ("0,6", "6,0", "sat,sun"):
        return "fim de semana"
    try:
        if "-" in campo:
            a, b = (int(x) % 7 for x in campo.split("-"))
            return f"{DIAS[a]}–{DIAS[b]}"
        return ", ".join(DIAS[int(x) % 7] for x in campo.split(","))
    except ValueError:
        return None


def descrever(expr: str) -> str:
    """'50 6 * * 1-5' → 'seg–sex às 06:50'. Cai para a expressão crua se não souber."""
    partes = expr.split()
    if len(partes) != 5:
        return expr
    minuto, hora, dia_mes, mes, dia_semana = partes
    if dia_mes != "*" or mes != "*":
        return expr
    dias = _dias_semana(dia_semana)
    sufixo = "" if dias in (None, "todo dia") else f", {dias}"
    if minuto.isdigit() and hora.startswith("*/"):
        return f"a cada {hora[2:]}h (min {int(minuto):02d}){sufixo}"
    if minuto.isdigit() and (m := re.fullmatch(r"(\d+)-(\d+)/(\d+)", hora)):
        a, b, passo = m.groups()
        return f"a cada {passo}h, das {int(a):02d}h às {int(b):02d}h{sufixo}"
    if not (minuto.isdigit() and hora.isdigit()):
        return expr
    if dias is None:
        return expr
    return f"{dias} às {int(hora):02d}:{int(minuto):02d}"


def ultimo_disparo(expr: str, agora: datetime, tz: ZoneInfo, janela_dias: int = 35) -> datetime | None:
    """O disparo mais recente até `agora` (o APScheduler só calcula o próximo, então andamos para frente
    a partir de `agora - janela`). 35 dias cobre rotinas diárias, semanais e mensais."""
    trigger = criar_trigger(expr, tz)
    atual = trigger.get_next_fire_time(None, agora - timedelta(days=janela_dias))
    ultimo = None
    while atual and atual <= agora:
        ultimo = atual
        atual = trigger.get_next_fire_time(atual, atual + timedelta(seconds=1))
    return ultimo
