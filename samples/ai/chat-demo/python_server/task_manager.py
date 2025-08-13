"""Connection task management utilities.

Provides a ConnectionTaskManager that tracks background asyncio Futures
per connectionId so they can be cancelled on disconnect.
"""
from __future__ import annotations
import asyncio
from typing import Awaitable, Dict, Set
from concurrent.futures import Future

class ConnectionTaskManager:
    """Manage background tasks keyed by connectionId.

    Scheduling uses run_coroutine_threadsafe because the caller often runs
    from a non-event-loop thread (Flask thread). All created Futures are stored
    so they can be cancelled explicitly on disconnect.
    """
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop
        self._tasks: Dict[str, Set[Future]] = {}

    def schedule(self, connection_id: str, coro: Awaitable) -> Future:
        fut: Future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        bucket = self._tasks.setdefault(connection_id, set())
        bucket.add(fut)
        fut.add_done_callback(lambda _f: bucket.discard(fut))
        return fut

    def cancel_all(self, connection_id: str) -> None:
        bucket = self._tasks.get(connection_id)
        if not bucket:
            return
        for fut in tuple(bucket):
            try:
                fut.cancel()
            except Exception:
                pass
        bucket.clear()

    def active_count(self, connection_id: str) -> int:
        bucket = self._tasks.get(connection_id)
        return len(bucket) if bucket else 0

    def total_active(self) -> int:
        return sum(len(b) for b in self._tasks.values())
