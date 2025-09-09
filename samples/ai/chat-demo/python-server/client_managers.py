from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Awaitable, Dict, Iterable, List, Optional, Set, Tuple

from websockets.server import WebSocketServerProtocol

from typing import Protocol, runtime_checkable, Awaitable, Any
# keep: from websockets.server import WebSocketServerProtocol

@runtime_checkable
class AsyncSendable(Protocol):
    """Anything that can asynchronously send a single message payload."""
    def send(self, data: Any) -> Awaitable[None]: ...

@dataclass
class SendResult:
    connection_id: str
    ok: bool
    error: Optional[str] = None


class ClientManager(ABC):
    """Common interface for client/group management (transport only)."""

    @abstractmethod
    async def add_client(self, connection_id: str, context: Any, transport: AsyncSendable) -> None: ...

    @abstractmethod
    async def remove_client(self, connection_id: str) -> None: ...

    @abstractmethod
    async def add_client_to_group(self, connection_id: str, group_name: str) -> None: ...

    @abstractmethod
    async def remove_client_from_group(self, connection_id: str, group_name: str) -> None: ...

    @abstractmethod
    async def send_to_group(self, group_name: str, message: Any, exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> List[SendResult]: ...

    @abstractmethod
    async def broadcast(self, message: Any, exclude_ids: Optional[List[str]] = None) -> List[SendResult]: ...


async def _wait_for(awaitable: Awaitable[Any], timeout: Optional[float]) -> Any:
    if timeout is None:
        return await awaitable
    return await asyncio.wait_for(awaitable, timeout)


class InMemoryClientManager(ClientManager):
    """Async, lock-safe client/group registry (transport only)."""

    def __init__(self, *, max_concurrency: Optional[int] = None, send_timeout: Optional[float] = None,
                 logger: Optional[logging.Logger] = None) -> None:
        self._clients: Dict[str, (Any, AsyncSendable)] = {}
        self._groups: Dict[str, Set[str]] = defaultdict(set)
        self._lock: Optional[asyncio.Lock] = None  # created lazily
        self._sema: Optional[asyncio.Semaphore] = None
        self._max_concurrency = max_concurrency
        self._send_timeout = send_timeout
        self._logger = logger

    def _ensure_primitives(self) -> None:
        if self._lock is None:
            self._lock = asyncio.Lock()
        if self._max_concurrency and self._sema is None:
            self._sema = asyncio.Semaphore(self._max_concurrency)

    async def add_client(self, connection_id: str, context: Any, transport: AsyncSendable) -> None:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            if connection_id in self._clients:
                raise KeyError(f"Client already exists: {connection_id}")
            self._clients[connection_id] = (context, transport)

    async def remove_client(self, connection_id: str) -> None:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            self._clients.pop(connection_id, None)
            # Remove the connection from all groups
            for members in self._groups.values():
                members.discard(connection_id)
            # Clean up groups that became empty
            empty_groups = [g for g, members in self._groups.items() if not members]
            for g in empty_groups:
                self._groups.pop(g, None)

    async def add_client_to_group(self, connection_id: str, group_name: str) -> None:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            if connection_id not in self._clients:
                raise KeyError(f"Unknown client: {connection_id}")
            self._groups[group_name].add(connection_id)

    async def remove_client_from_group(self, connection_id: str, group_name: str) -> None:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            if group_name in self._groups:
                self._groups[group_name].discard(connection_id)
                became_empty = not self._groups[group_name]
                if became_empty:
                    # Remove the group entry when empty
                    self._groups.pop(group_name, None)

    async def _snapshot(self) -> Tuple[Dict[str, Any], Dict[str, Set[str]]]:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            clients = dict(self._clients)
            groups = {g: set(members) for g, members in self._groups.items()}
        return clients, groups

    # Transport-only; room history and listing are handled by RoomStore.

    async def send_to_group(self, group_name: str, message: Any, exclude_ids: List[str] | None = None, from_user_id: str | None = None) -> List[SendResult]:
        clients, groups = await self._snapshot()
        ids = groups.get(group_name, set())
        return await self._send_many(ids, clients, message, exclude_ids)

    async def broadcast(self, message: Any, exclude_ids: List[str] | None = None) -> List[SendResult]:
        clients, _ = await self._snapshot()
        return await self._send_many(clients.keys(), clients, message, exclude_ids)

    async def _send_many(self, ids: Iterable[str], clients: Dict[str, Any], message: Any, exclude_ids: List[str] | None = None) -> List[SendResult]:
        tasks: List[asyncio.Task] = []
        for cid in ids:
            if exclude_ids and cid in exclude_ids:
                continue
            client = clients.get(cid)
            if client is None:
                tasks.append(asyncio.create_task(asyncio.sleep(0, result=SendResult(cid, False, "not_found"))))
                continue
            tasks.append(asyncio.create_task(self._safe_send(client[1], cid, message)))
        if not tasks:
            return []
        return list(await asyncio.gather(*tasks))

    async def _safe_send(self, client: AsyncSendable, connection_id: str, message: Any) -> SendResult:
        try:
            if self._sema is None:
                await _wait_for(client.send(message), self._send_timeout)
            else:
                async with self._sema:
                    await _wait_for(client.send(message), self._send_timeout)
            return SendResult(connection_id, True)
        except asyncio.TimeoutError:
            if self._logger:
                self._logger.warning("send_message timeout for %s", connection_id)
            return SendResult(connection_id, False, "timeout")
        except Exception as exc:  # noqa: BLE001
            if self._logger:
                self._logger.exception("send_message failed for %s: %s", connection_id, exc)
            return SendResult(connection_id, False, "error")



class AzureStorageClientManager(InMemoryClientManager):
    """Compatibility subclass for legacy configuration; no Azure persistence.
    """
    def __init__(self, *, connection_string: Optional[str] = None, container_name: Optional[str] = None,
                 blob_name: Optional[str] = None, max_concurrency: Optional[int] = None,
                 send_timeout: Optional[float] = None, logger: Optional[logging.Logger] = None) -> None:
        super().__init__(max_concurrency=max_concurrency, send_timeout=send_timeout, logger=logger)
