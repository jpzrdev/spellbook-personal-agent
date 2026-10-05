"""Agendador das rotinas: lê vida/rotinas/*.md, registra os crons ativos e recarrega quando
a pasta muda (pelo HUD, pelo Obsidian ou à mão). Fuso America/Sao_Paulo."""

import logging
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import frontmatter
from apscheduler.schedulers.background import BackgroundScheduler
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from app import clock, cron, efemeros, push
from app.eventos import eventos_gerais
from app.gandalf import tier3
from app.receipts import Recibo, gravar_recibo
from app.routines.acoes import ACOES, AcaoFalhou
from app.vault.reader import ROTINAS, Rotina, ler_rotinas

log = logging.getLogger("lifeos.rotinas")


class _Vigia(FileSystemEventHandler):
    """Recarrega com atraso de 1 s para juntar várias mudanças seguidas (salvar do editor)."""

    def __init__(self, recarregar):
        self._recarregar = recarregar
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def on_any_event(self, event):
        if event.is_directory or not str(event.src_path).endswith(".md"):
            return
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(1.0, self._recarregar)
            self._timer.daemon = True
            self._timer.start()


class Agendador:
    def __init__(self, vault: Path, tz: ZoneInfo):
        self.vault = vault
        self.tz = tz
        self._scheduler = BackgroundScheduler(
            timezone=tz,
            # Se o computador estava dormindo, roda uma vez ao acordar (até 10 min de atraso).
            job_defaults={"coalesce": True, "misfire_grace_time": 600, "max_instances": 1},
        )
        self._observer = None
        self._lock = threading.Lock()

    # ---------- ciclo de vida ----------

    def iniciar(self) -> None:
        self.recarregar()
        self._scheduler.start()
        pasta = self.vault / ROTINAS
        pasta.mkdir(parents=True, exist_ok=True)
        self._observer = Observer()
        self._observer.schedule(_Vigia(self.recarregar), str(pasta), recursive=False)
        self._observer.daemon = True
        self._observer.start()
        rotinas = [j for j in self._scheduler.get_jobs() if not j.id.startswith("_")]  # "_..." = jobs internos
        log.info("agendador iniciado com %d rotina(s) ativa(s)", len(rotinas))
        # Rotinas que perderam o horário (PC desligado, Bridge fechado) rodam uma vez agora.
        threading.Thread(target=self.recuperar_atrasadas, name="rotinas-atrasadas", daemon=True).start()

    def parar(self) -> None:
        if self._observer:
            self._observer.stop()
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    def recarregar(self) -> None:
        with self._lock:
            self._scheduler.remove_all_jobs()
            for r in ler_rotinas(self.vault):
                if not r.ativa:
                    continue
                try:
                    trigger = cron.criar_trigger(r.cron, self.tz)
                except ValueError:
                    log.warning("rotina %s com cron inválido: %r", r.slug, r.cron)
                    continue
                self._scheduler.add_job(self.executar, trigger, id=r.slug, args=[r.slug], replace_existing=True)
            # Limpeza das saídas efêmeras vencidas (de hora em hora).
            self._scheduler.add_job(efemeros.listar, "interval", hours=1, id="_limpar_efemeros", replace_existing=True)
        eventos_gerais.publicar({"tipo": "rotinas_recarregadas"})

    # ---------- consulta ----------

    def _criada_em(self, rotina: Rotina) -> datetime:
        """Quando a rotina passou a existir: campo `criada` (gravado pelo HUD) ou data do arquivo."""
        arquivo = self.vault / ROTINAS / f"{rotina.slug}.md"
        try:
            criada = frontmatter.load(arquivo).get("criada")
            if criada:
                dt = criada if isinstance(criada, datetime) else datetime.fromisoformat(str(criada))
                return dt if dt.tzinfo else dt.replace(tzinfo=self.tz)
        except (OSError, ValueError, TypeError):
            pass
        try:
            return datetime.fromtimestamp(arquivo.stat().st_ctime, self.tz)
        except OSError:
            return clock.now()

    def atrasadas(self, agora: datetime) -> list[tuple[Rotina, datetime]]:
        """Rotinas ativas cujo último horário já passou sem nenhuma execução desde então.

        Só o horário perdido mais recente conta (uma rotina "a cada 2h" que perdeu 5 horários
        roda uma vez). Horários anteriores à criação da rotina não contam.
        """
        from app.routines.status import TOLERANCIA, execucoes

        pendentes: list[tuple[Rotina, datetime]] = []
        for r in ler_rotinas(self.vault):
            if not r.ativa:
                continue
            try:
                ultimo = cron.ultimo_disparo(r.cron, agora, self.tz)
            except ValueError:
                continue
            if ultimo is None or ultimo < self._criada_em(r):
                continue
            if not execucoes(self.vault, ultimo - TOLERANCIA, agora).get(r.slug):
                pendentes.append((r, ultimo))
        return pendentes

    def recuperar_atrasadas(self, espera_s: float = 5.0) -> list[dict]:
        """Roda (uma vez cada) as rotinas que perderam o horário. Chamado ao iniciar o Bridge."""
        time.sleep(espera_s)  # deixa o servidor terminar de subir
        resultados = []
        for r, era in self.atrasadas(clock.now()):
            log.info("rotina atrasada: %s (era %s)", r.slug, era.isoformat())
            try:
                resultados.append(self.executar(r.slug, atrasada_de=era))
            except Exception:
                log.exception("falha ao recuperar a rotina %s", r.slug)
        return resultados

    def proxima(self, rotina: Rotina) -> datetime | None:
        if not rotina.ativa:
            return None
        try:
            return cron.criar_trigger(rotina.cron, self.tz).get_next_fire_time(None, clock.now())
        except ValueError:
            return None

    # ---------- execução ----------

    def executar(self, slug: str, manual: bool = False, atrasada_de: datetime | None = None) -> dict:
        """Roda a rotina agora. Tier 1: ação interna (recibo na hora). Tier 3: abre sessão."""
        rotina = next((r for r in ler_rotinas(self.vault) if r.slug == slug), None)
        if rotina is None:
            raise KeyError(slug)
        agora = clock.now()
        pedido = f"Rotina: {rotina.nome}"
        if atrasada_de:
            pedido += f" (atrasada: era {atrasada_de:%H:%M} de {atrasada_de:%d/%m})"
        eventos_gerais.publicar(
            {"tipo": "rotina", "slug": slug, "status": "rodando", "manual": manual, "atrasada": atrasada_de is not None}
        )

        if rotina.tier == 1:
            inicio = time.perf_counter()
            acao = ACOES.get(rotina.acao or "")
            status = "ok"
            try:
                if not acao:
                    raise AcaoFalhou(f"ação desconhecida: {rotina.acao!r}")
                resposta = acao[1](self.vault, agora)
            except Exception as e:  # registra a falha no recibo em vez de derrubar o agendador
                status = "erro"
                resposta = f"Falhou: {e}"
            efemero_id = None
            if rotina.saida == "efemera" and status == "ok":
                efemero_id = efemeros.salvar(rotina.nome, resposta, "rotina", rotina=slug, chave=slug).id
                eventos_gerais.publicar({"tipo": "efemero", "id": efemero_id, "titulo": rotina.nome})
                push.enviar_em_segundo_plano(push.Notificacao(f"📬 {rotina.nome} pronto", "Toque para ler no Gandalf.", "/", tag=f"efemero-{slug}"))
            elif status == "ok" and rotina.notificar:
                push.enviar_em_segundo_plano(push.Notificacao(f"✅ {rotina.nome}", resposta.strip().splitlines()[0][:120] if resposta.strip() else "", "/rotinas", tag=f"rotina-{slug}"))
            elif status == "erro":
                push.enviar_em_segundo_plano(push.Notificacao(f"⚠️ {rotina.nome}: não deu certo", resposta[:120], "/rotinas"))
            rid, _ = gravar_recibo(
                self.vault,
                Recibo(
                    pedido=pedido,
                    resposta="(saída efêmera: conteúdo mostrado no HUD e não guardado no vault)" if efemero_id else resposta,
                    origem="rotina",
                    tier=1,
                    quando=agora,
                    duracao_ms=round((time.perf_counter() - inicio) * 1000),
                    intent=f"acao:{rotina.acao}",
                    rotina=slug,
                    status=status,
                ),
            )
            eventos_gerais.publicar({"tipo": "rotina", "slug": slug, "status": status, "recibo_id": rid})
            return {"slug": slug, "tier": 1, "status": status, "recibo_id": rid, "resposta": resposta, "efemero_id": efemero_id}

        tarefa = rotina.descricao or rotina.nome
        s = tier3.gerenciador(self.vault).criar(
            tarefa,
            pedido=pedido,
            origem="rotina",
            skill=rotina.skill,
            rotina=slug,
            saida=rotina.saida,
            notificar=rotina.notificar,
        )
        return {"slug": slug, "tier": 3, "status": s.status, "sessao_id": s.id}


_agendador: Agendador | None = None
_lock_global = threading.Lock()


def agendador(vault: Path) -> Agendador:
    """O agendador do vault (criado sem iniciar; o lifespan do app chama `iniciar`)."""
    global _agendador
    with _lock_global:
        if _agendador is None or _agendador.vault != vault:
            _agendador = Agendador(vault, clock.tz())
        return _agendador


def resetar() -> None:
    global _agendador
    with _lock_global:
        if _agendador:
            _agendador.parar()
        _agendador = None
