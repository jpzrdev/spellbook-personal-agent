"""Agendador dos lembretes (`vida/lembretes.md`): avisa no horário por push e no HUD aberto.

- Único: dispara uma vez e é marcado `[x]`. Se o Bridge estava desligado no horário, dispara ao subir
  (com "atrasado").
- Recorrente (cron): dispara em cada horário. Ao subir, o último horário perdido nas últimas
  `RECUPERAR_RECORRENTE` horas dispara uma vez.
O estado dos recorrentes (último aviso) fica em `bridge/dados/lembretes_estado.json`.
"""

import json
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from app import clock, cron, push
from app.config import get_settings
from app.eventos import eventos_gerais
from app.vault import lembretes as arquivo
from app.vault.lembretes import Lembrete

log = logging.getLogger("lifeos.lembretes")
RECUPERAR_RECORRENTE = timedelta(hours=6)
AVISO = "aviso-"


def _estado_path() -> Path:
    p = get_settings().dados_path
    p.mkdir(parents=True, exist_ok=True)
    return p / "lembretes_estado.json"


def _estado() -> dict[str, str]:
    try:
        return json.loads(_estado_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _marcar_estado(lembrete_id: str, quando: datetime) -> None:
    e = _estado()
    e[lembrete_id] = quando.isoformat(timespec="seconds")
    _estado_path().write_text(json.dumps(e, indent=1), encoding="utf-8")


def lembrete_json(x: Lembrete, proximo: datetime | None = None) -> dict:
    if proximo is None and not x.concluido:
        proximo = x.quando
    return {
        "id": x.id,
        "texto": x.texto,
        "concluido": x.concluido,
        "quando": x.quando.isoformat(timespec="minutes") if x.quando else None,
        "recorrencia": x.recorrencia,
        "recorrencia_texto": cron.descrever(x.recorrencia) if x.recorrencia else None,
        "concluido_em": x.concluido_em.isoformat(timespec="minutes") if x.concluido_em else None,
        "proximo": proximo.isoformat(timespec="minutes") if proximo else None,
    }


class _Vigia(FileSystemEventHandler):
    def __init__(self, recarregar):
        self._recarregar = recarregar
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def on_any_event(self, event):
        if event.is_directory or not str(event.src_path).replace("\\", "/").endswith(arquivo.LEMBRETES.as_posix()):
            return
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(0.7, self._recarregar)
            self._timer.daemon = True
            self._timer.start()


class AgendadorLembretes:
    def __init__(self, vault: Path, tz: ZoneInfo):
        self.vault = vault
        self.tz = tz
        self._scheduler = BackgroundScheduler(
            timezone=tz, job_defaults={"coalesce": True, "misfire_grace_time": 3600, "max_instances": 1}
        )
        self._observer = None
        self._lock = threading.Lock()

    def iniciar(self) -> None:
        self._scheduler.start()
        self.recarregar(recuperar=True)
        pasta = (self.vault / arquivo.LEMBRETES).parent
        pasta.mkdir(parents=True, exist_ok=True)
        self._observer = Observer()
        self._observer.schedule(_Vigia(self.recarregar), str(pasta), recursive=False)
        self._observer.daemon = True
        self._observer.start()

    def parar(self) -> None:
        if self._observer:
            self._observer.stop()
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def proximo(self, x: Lembrete, agora: datetime | None = None) -> datetime | None:
        if x.concluido:
            return None
        if x.quando:
            return x.quando
        try:
            return cron.criar_trigger(x.recorrencia, self.tz).get_next_fire_time(None, agora or clock.now())
        except (ValueError, TypeError):
            return None

    def recarregar(self, recuperar: bool = False) -> None:
        """Reagenda tudo a partir do arquivo. Únicos vencidos disparam já (o Bridge estava fora)."""
        agora = clock.now()
        atrasados: list[tuple[str, datetime]] = []
        with self._lock:
            for job in self._scheduler.get_jobs():
                if not job.id.startswith(AVISO):  # avisos avulsos (pomodoro) não vêm do arquivo
                    job.remove()
            estado = _estado()
            for x in arquivo.ler(self.vault, self.tz):
                if x.concluido:
                    continue
                if x.quando:
                    if x.quando <= agora:
                        atrasados.append((x.id, x.quando))
                    else:
                        self._scheduler.add_job(self.disparar, DateTrigger(x.quando, self.tz), id=x.id, args=[x.id], replace_existing=True)
                    continue
                try:
                    trigger = cron.criar_trigger(x.recorrencia, self.tz)
                except (ValueError, TypeError):
                    log.warning("lembrete %s com recorrência inválida: %r", x.id, x.recorrencia)
                    continue
                self._scheduler.add_job(self.disparar, trigger, id=x.id, args=[x.id], replace_existing=True)
                if recuperar:
                    ultimo = cron.ultimo_disparo(x.recorrencia, agora, self.tz, janela_dias=1)
                    avisado = estado.get(x.id)
                    if ultimo and agora - ultimo <= RECUPERAR_RECORRENTE and (not avisado or datetime.fromisoformat(avisado) < ultimo):
                        atrasados.append((x.id, ultimo))
        for lid, era in atrasados:
            self._scheduler.add_job(self.disparar, "date", run_date=agora + timedelta(seconds=2), args=[lid, era],
                                    id=f"atrasado-{lid}", replace_existing=True)
        eventos_gerais.publicar({"tipo": "lembretes"})

    # ---------- avisos avulsos (fora do arquivo; ex.: fim de um pomodoro) ----------

    def agendar_aviso(self, nome: str, quando: datetime, titulo: str, corpo: str = "", url: str = "/") -> bool:
        """Push único em `quando`, só na memória (se o Bridge reiniciar, o aviso some). Substitui o de mesmo nome."""
        if not self._scheduler.running:
            return False
        n = push.Notificacao(titulo=titulo, corpo=corpo, url=url, tag=AVISO + nome)
        self._scheduler.add_job(push.enviar, DateTrigger(quando, self.tz), args=[n], id=AVISO + nome, replace_existing=True)
        return True

    def cancelar_aviso(self, nome: str) -> bool:
        try:
            self._scheduler.remove_job(AVISO + nome)
            return True
        except Exception:
            return False

    def disparar(self, lembrete_id: str, atrasado_de: datetime | None = None) -> dict | None:
        """Avisa (push + HUD aberto) e encerra o lembrete único."""
        agora = clock.now()
        x = next((y for y in arquivo.ler(self.vault, self.tz) if y.id == lembrete_id), None)
        if x is None or x.concluido:
            return None
        corpo = "Toque para abrir o Gandalf."
        if atrasado_de and agora - atrasado_de > timedelta(minutes=2):
            corpo = f"Atrasado: era {atrasado_de:%H:%M}" + (f" de {atrasado_de:%d/%m}" if atrasado_de.date() != agora.date() else "") + "."
        enviados = push.enviar(
            push.Notificacao(titulo=f"⏰ {x.texto}", corpo=corpo, url=f"/?lembrete={x.id}", tag=f"lembrete-{x.id}",
                             lembrete_id=None if x.recorrente else x.id)
        )
        if x.recorrente:
            _marcar_estado(x.id, agora)
        else:
            try:
                arquivo.atualizar(self.vault, self.tz, x.id, concluido=True, agora=agora)
            except arquivo.LembreteNaoEncontrado:
                pass
        evento = {"tipo": "lembrete", "id": x.id, "texto": x.texto, "push": enviados, "atrasado": corpo.startswith("Atrasado")}
        eventos_gerais.publicar(evento)
        log.info("lembrete %s disparado (%d aparelho[s])", x.id, enviados)
        return evento


_agendador: AgendadorLembretes | None = None
_lock_global = threading.Lock()


def agendador(vault: Path) -> AgendadorLembretes:
    global _agendador
    with _lock_global:
        if _agendador is None or _agendador.vault != vault:
            _agendador = AgendadorLembretes(vault, clock.tz())
        return _agendador


def recarregar_se_ativo(vault: Path) -> None:
    """Depois de uma escrita pelo Bridge (o vigia também pega, mas assim é imediato)."""
    with _lock_global:
        ag = _agendador if _agendador and _agendador.vault == vault and _agendador._scheduler.running else None
    if ag:
        ag.recarregar()


def resetar() -> None:
    global _agendador
    with _lock_global:
        if _agendador:
            _agendador.parar()
        _agendador = None
