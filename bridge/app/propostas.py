"""Propostas de evento para o Google Agenda, esperando a confirmação do usuário no HUD.

Ficam em `bridge/dados/propostas/<id>.json` (fora do vault) e expiram em 7 dias. Nada é criado
na agenda sem `POST /propostas/{id}/confirmar`.
"""

import json
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

from app import clock
from app.config import get_settings

_lock = threading.Lock()
VALIDADE = timedelta(days=7)
REPETIR = ("anual", "mensal", "semanal", "diaria")
RRULE = {"anual": "RRULE:FREQ=YEARLY", "mensal": "RRULE:FREQ=MONTHLY", "semanal": "RRULE:FREQ=WEEKLY", "diaria": "RRULE:FREQ=DAILY"}


class PropostaInvalida(ValueError):
    pass


@dataclass
class Evento:
    """Formato simples (fácil para o Tier 2 e para o formulário do HUD); o Bridge monta o resto."""

    titulo: str
    data: str  # AAAA-MM-DD
    dia_inteiro: bool = False
    hora_inicio: str | None = None  # HH:MM
    hora_fim: str | None = None
    repetir: str | None = None  # anual | mensal | semanal | diaria
    avisos_min: list[int] = field(default_factory=list)
    local: str | None = None
    descricao: str | None = None


@dataclass
class Proposta:
    id: str
    evento: Evento
    pedido: str
    origem: str
    criada: str
    expira: str
    status: str = "pendente"  # pendente | confirmada
    sessao_id: str | None = None


def _hhmm(valor: str | None, campo: str) -> str | None:
    if not valor:
        return None
    try:
        h, m = str(valor).strip().split(":")[:2]
        return f"{int(h):02d}:{int(m):02d}" if 0 <= int(h) < 24 and 0 <= int(m) < 60 else _erro(campo)
    except ValueError:
        return _erro(campo)


def _erro(campo: str):
    raise PropostaInvalida(f"{campo} inválido")


def normalizar(dados: dict) -> Evento:
    """Valida e completa um evento vindo do Tier 2 ou do formulário."""
    titulo = str(dados.get("titulo") or "").strip()
    if not titulo:
        raise PropostaInvalida("o evento precisa de um título")
    try:
        dia = date.fromisoformat(str(dados.get("data") or "")[:10])
    except ValueError as e:
        raise PropostaInvalida("data do evento inválida") from e
    inicio = _hhmm(dados.get("hora_inicio"), "horário de início")
    dia_inteiro = bool(dados.get("dia_inteiro")) or not inicio
    fim = None
    if not dia_inteiro:
        fim = _hhmm(dados.get("hora_fim"), "horário de fim")
        if not fim or fim <= inicio:  # padrão: 1 hora
            h, m = map(int, inicio.split(":"))
            fim = f"{min(h + 1, 23):02d}:{m if h < 23 else 59:02d}"
    repetir = dados.get("repetir") or None
    if repetir not in (None, *REPETIR):
        raise PropostaInvalida(f"repetição inválida: {repetir}")
    avisos = dados.get("avisos_min")
    if avisos is None:
        avisos = [900] if dia_inteiro else [30]  # dia inteiro: véspera às 9h
    try:
        avisos = sorted({int(a) for a in avisos if 0 <= int(a) <= 40320})[:5]
    except (TypeError, ValueError) as e:
        raise PropostaInvalida("avisos inválidos") from e
    texto = lambda k, n: (str(dados.get(k) or "").strip()[:n] or None)  # noqa: E731
    return Evento(
        titulo=titulo[:200], data=dia.isoformat(), dia_inteiro=dia_inteiro,
        hora_inicio=None if dia_inteiro else inicio, hora_fim=fim, repetir=repetir,
        avisos_min=avisos, local=texto("local", 200), descricao=texto("descricao", 1000),
    )


def argumentos_create_event(e: Evento, timezone: str) -> dict:
    """Os parâmetros exatos da ferramenta `create_event` do conector do Google Agenda."""
    tz = clock.tz()
    dia = date.fromisoformat(e.data)
    if e.dia_inteiro:
        inicio = datetime.combine(dia, datetime.min.time(), tz)
        fim = inicio + timedelta(days=1)
    else:
        inicio = datetime.combine(dia, datetime.strptime(e.hora_inicio, "%H:%M").time(), tz)
        fim = datetime.combine(dia, datetime.strptime(e.hora_fim, "%H:%M").time(), tz)
    args: dict = {
        "summary": e.titulo,
        "startTime": inicio.isoformat(timespec="seconds"),
        "endTime": fim.isoformat(timespec="seconds"),
        "timeZone": timezone,
        "allDay": e.dia_inteiro,
    }
    if e.dia_inteiro:
        args["availability"] = "AVAILABILITY_FREE"
    if e.repetir:
        args["recurrenceData"] = [RRULE[e.repetir]]
    if e.avisos_min:
        args["overrideReminders"] = [{"method": "popup", "minutes": m} for m in e.avisos_min]
    else:
        args["useDefaultReminders"] = False
    if e.local:
        args["location"] = e.local
    if e.descricao:
        args["description"] = e.descricao
    return args


# ---------- armazenamento ----------

def _pasta() -> Path:
    pasta = get_settings().dados_path / "propostas"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def _gravar(p: Proposta) -> None:
    (_pasta() / f"{p.id}.json").write_text(json.dumps(asdict(p), ensure_ascii=False, indent=1), encoding="utf-8")


def criar(evento: Evento, pedido: str, origem: str) -> Proposta:
    agora = clock.now()
    p = Proposta(
        id=uuid.uuid4().hex[:12], evento=evento, pedido=pedido[:500], origem=origem,
        criada=agora.isoformat(timespec="seconds"), expira=(agora + VALIDADE).isoformat(timespec="seconds"),
    )
    with _lock:
        _gravar(p)
    return p


def obter(proposta_id: str) -> Proposta | None:
    if not proposta_id.isalnum():
        return None
    arquivo = _pasta() / f"{proposta_id}.json"
    try:
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    p = Proposta(**{**dados, "evento": Evento(**dados["evento"])})
    if datetime.fromisoformat(p.expira) < clock.now():
        arquivo.unlink(missing_ok=True)
        return None
    return p


def confirmar(p: Proposta, evento: Evento, sessao_id: str) -> Proposta:
    p.evento, p.status, p.sessao_id = evento, "confirmada", sessao_id
    with _lock:
        _gravar(p)
    return p


def remover(proposta_id: str) -> bool:
    if not proposta_id.isalnum():
        return False
    arquivo = _pasta() / f"{proposta_id}.json"
    existia = arquivo.exists()
    arquivo.unlink(missing_ok=True)
    return existia
