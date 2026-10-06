"""Simple pub/sub between threads (Tier 3, routines) and WebSockets (asyncio)."""

import asyncio
import threading


class Channel:
    """Delivers events to asyncio queues from any thread, safely."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()

    def subscribe(self, loop: asyncio.AbstractEventLoop) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._subscribers.add((loop, queue))
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        with self._lock:
            self._subscribers = {(lp, q) for lp, q in self._subscribers if q is not queue}

    def publish(self, event: dict) -> None:
        with self._lock:
            targets = list(self._subscribers)
        for loop, queue in targets:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:  # loop already closed
                self.unsubscribe(queue)


# System-wide events (/ws/events): a session changed status, a receipt was written, etc.
system_events = Channel()
