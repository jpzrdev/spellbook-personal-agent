"""Pub/sub simples entre threads (Tier 3, rotinas) e WebSockets (asyncio)."""

import asyncio
import threading


class Canal:
    """Entrega eventos a filas asyncio de qualquer thread, com segurança."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._assinantes: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()

    def assinar(self, loop: asyncio.AbstractEventLoop) -> asyncio.Queue:
        fila: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._assinantes.add((loop, fila))
        return fila

    def cancelar(self, fila: asyncio.Queue) -> None:
        with self._lock:
            self._assinantes = {(lp, f) for lp, f in self._assinantes if f is not fila}

    def publicar(self, evento: dict) -> None:
        with self._lock:
            alvos = list(self._assinantes)
        for loop, fila in alvos:
            try:
                loop.call_soon_threadsafe(fila.put_nowait, evento)
            except RuntimeError:  # loop já fechado
                self.cancelar(fila)


# Eventos gerais do sistema (/ws/events): sessão mudou de status, recibo criado, etc.
eventos_gerais = Canal()
