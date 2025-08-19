"""ChatService: asyncio WebSocket server with pluggable callbacks.

This module provides:
- `ChatService.start_chat(host, port)` – start a WebSocket server (asyncio)
- `ChatService.stop()` – graceful shutdown
- Callback hooks: `.on_message(cb)`, `.on_connect(cb)`, `.on_disconnect(cb)`, `.on_error(cb)`
  (and a generic `.on(event, cb)`)
- Broadcast APIs using an in-memory, lock-safe `InMemoryClientManager`
- No external frameworks beyond `websockets` (install with `pip install websockets`)

Notes
- This is **process-local**. For multi-process deployments, use a shared backend (e.g., Redis) for fan-out.
- All callbacks may be **sync or async**; we `await` coroutine callbacks and call sync ones directly.
- We never await while holding the client registry lock.
"""
from __future__ import annotations

import asyncio
import logging
import json
from multiprocessing import context
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Set, Tuple, Union
from utils import generate_id
import websockets
from websockets.server import WebSocketServerProtocol

class ClientConnectionContext:
    """The basic properties for the client connection."""
    def __init__(self, path, connectionId) -> None:
        self.path = path
        self.connectionId = connectionId

# ------------------------------ Types ------------------------------
OnConnected = Callable[[ClientConnectionContext, "ChatService"], Union[Awaitable[None], None]]
OnDisconnected = Callable[[ClientConnectionContext, "ChatService"], Union[Awaitable[None], None]]
OnEventMessage = Callable[[ClientConnectionContext, str, str, "ChatService"], Union[Awaitable[None], None]]  # (connection_id, event_name, message, svc)
OnError = Callable[[ClientConnectionContext, BaseException, "ChatService"], Union[Awaitable[None], None]]


# ==================================================================
# InMemoryClientManager (simplified, strict add: no overwrite)
# ==================================================================
@dataclass
class SendResult:
    connection_id: str
    ok: bool
    error: Optional[str] = None


class InMemoryClientManager:
    """Async, lock-safe client/group registry.

    Each client must expose `async def send_message(self, message): ...`.
    """

    def __init__(self, *, max_concurrency: Optional[int] = None, send_timeout: Optional[float] = None,
                 logger: Optional[logging.Logger] = None) -> None:
        self._clients: Dict[str, (ClientConnectionContext, WebSocketServerProtocol)] = {}
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

    async def add_client(self, connection_id: str, context: ClientConnectionContext, ws: WebSocketServerProtocol) -> None:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            if connection_id in self._clients:
                raise KeyError(f"Client already exists: {connection_id}")
            self._clients[connection_id] = (context, ws)

    async def remove_client(self, connection_id: str) -> None:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            self._clients.pop(connection_id, None)
            for members in self._groups.values():
                members.discard(connection_id)

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
                if not self._groups[group_name]:
                    self._groups.pop(group_name, None)

    async def _snapshot(self) -> Tuple[Dict[str, Any], Dict[str, Set[str]]]:
        self._ensure_primitives()
        assert self._lock is not None
        async with self._lock:
            clients = dict(self._clients)
            groups = {g: set(members) for g, members in self._groups.items()}
        return clients, groups

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

    async def _safe_send(self, client: WebSocketServerProtocol, connection_id: str, message: Any) -> SendResult:
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


async def _wait_for(awaitable: Awaitable[Any], timeout: Optional[float]) -> Any:
    if timeout is None:
        return await awaitable
    return await asyncio.wait_for(awaitable, timeout)


# ==================================================================
# ChatService
# ==================================================================

supported_protocols = ['json.reliable.webpubsub.azure.v1', 'json.webpubsub.azure.v1']

class ChatService:
    def __init__(
        self,
        *,
        client_manager: Optional[InMemoryClientManager] = None,
        logger: Optional[logging.Logger] = None,
        max_message_size: Optional[int] = 2 ** 20,  # 1 MiB
    ) -> None:
        self.log = logger or logging.getLogger("chat_service")
        self.client_manager = client_manager or InMemoryClientManager(logger=self.log)
        self.max_message_size = max_message_size
        self._server: Optional[websockets.server.Serve] = None
        # event handlers
        self._on_connected: List[OnConnected] = []
        self._on_disconnected: List[OnDisconnected] = []
        self._on_event_message: List[OnEventMessage] = []
        self._on_error: List[OnError] = []

    # ---------------------- event registration ----------------------
    def on(self, event: str, handler: Callable[..., Union[Awaitable[None], None]]) -> None:
        if event == "connected":
            self._on_connected.append(handler)  # type: ignore[arg-type]
        elif event == "disconnected":
            self._on_disconnected.append(handler)  # type: ignore[arg-type]
        elif event == "event_message":
            self._on_event_message.append(handler)  # type: ignore[arg-type]
        elif event == "error":
            self._on_error.append(handler)  # type: ignore[arg-type]
        else:
            raise ValueError(f"Unknown event: {event}")

    def on_connected(self, handler: OnConnected) -> None:
        self.on("connected", handler)

    def on_disconnected(self, handler: OnDisconnected) -> None:
        self.on("disconnected", handler)

    def on_event_message(self, handler: OnEventMessage) -> None:
        self.on("event_message", handler)

    def on_error(self, handler: OnError) -> None:
        self.on("error", handler)

    # --------------------------- server -----------------------------
    async def start_chat(self, host: str = "0.0.0.0", port: int = 8765) -> None:
        """Start the WebSocket server and keep serving until cancelled.

        Use `asyncio.create_task(service.start_chat(...))` to run in background.
        """
        async def handler(ws: WebSocketServerProtocol, path: str) -> None:
            """Handle WebSocket connections with full Web PubSub subprotocol support"""
            
            selected_subprotocol = ws.subprotocol

            if selected_subprotocol not in supported_protocols:
                print(f"Unsupported subprotocol: {selected_subprotocol}")
                await ws.close()
                return
            connection_id = generate_id('conn-')
            client = ClientConnectionContext(path, connection_id)
            try:
                await self.client_manager.add_client(connection_id, client, ws)
                await self._emit(self._on_connected, client)

                connected_event = {
                    "type": "system", 
                    "event": "connected", 
                    "connectionId": connection_id,
                    "subprotocol": selected_subprotocol
                }
                await ws.send(json.dumps(connected_event))

                async for message in ws:
                    try:
                        data = json.loads(message)
                        if data.get('type') == 'event':
                            message_data = data.get('data', {})
                            user_message = message_data.get('message', '') if isinstance(message_data, dict) else str(message_data)
                            eventName = data.get('event')
                            print(f'Received message for event {eventName}: {user_message}')
                            if not user_message.strip():
                                continue
                            await self._emit(self._on_event_message, client, eventName, message_data)
                        elif data.get('type') == 'sendToGroup':
                            message_data = data.get('data', {})
                            user_message = message_data.get('message', '') if isinstance(message_data, dict) else str(message_data)
                            user_name = message_data.get('from')
                            group_name = message_data.get('group')
                            no_echo = message_data.get('noEcho', False)
                            print(f'Received message from {user_name} in group {group_name}: {user_message}')
                            if not user_message.strip():
                                continue
                            await self.client_manager.send_to_group(group_name, message_data, [connection_id] if no_echo else [], user_name)
                        elif data.get('type') == 'joinGroup':
                            group_name = data.get('group')
                            if group_name is None:
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": False, "error": "Group name is required"}
                                self.log.warning(f"Invalid group name: {group_name}")
                            else:
                                await self.client_manager.add_client_to_group(connection_id, group_name)
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                                self.log.info(f"Client joined group: {group_name}")
                            await ws.send(json.dumps(ack_message))
                        elif data.get('type') == 'leaveGroup':
                            group_name = data.get('group')
                            if group_name is None:
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": False, "error": "Group name is required"}
                                self.log.warning(f"Invalid group name: {group_name}")
                            else:
                                await self.client_manager.remove_client_from_group(connection_id, group_name)
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                                self.log.info(f"Client left group: {group_name}")
                            await ws.send(json.dumps(ack_message))
                        elif data.get('type') == 'sequenceAck':
                            break
                        else:
                            self.log.warning(f"Unknown message type: {message}")
                    except json.JSONDecodeError:
                        self.log.warning("Invalid JSON received")
                    except Exception as e:
                        self.log.error(f"Error handling message: {e}")
            except Exception as exc:
                self.log.error(f"Error in WebSocket handler: {exc}")
                await self._emit(self._on_error, client, exc)
                raise
            finally:
                self.log.info(f"WebSocket connection closed: {connection_id}")
                await self.client_manager.remove_client(connection_id)
                await self._emit(self._on_disconnected, client)

        self.log.info("Starting ChatService on %s:%s", host, port)
        # Using websockets.serve (returns a Serve object with .close/.wait_closed)
        self._server = await websockets.serve(
            handler,
            host,
            port,
            subprotocols=supported_protocols,
            ping_interval=None,
            ping_timeout=None,
            max_size=self.max_message_size,
        )
        try:
            await self._server.wait_closed()  # run until closed/cancelled
        finally:
            self.log.info("ChatService stopped")

    async def stop(self) -> None:
        self.log.info("Stopping ChatService")
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    # --------------------------- sending ----------------------------
    async def send_to_group(self, group: str, message: str, exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> List[SendResult]:
        group_data = {
            "type": "message",
            "from": "group",
            "group": group,
            "dataType": "json",
            "data": {
                "messageId": generate_id("m-"),
                "message": message,
                "from": "AI Assistant",
                "streaming": True
            },
            "fromUserId": from_user_id
        }
        
        return await self.client_manager.send_to_group(group, json.dumps(group_data), exclude_ids)
    
    async def streaming_to_group(self, group: str, chunks: Iterable[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> List[SendResult]:
        full_response = ""
        message_id = generate_id("m-")
        for chunk in chunks:
            full_response += chunk
            group_data = {
                "type": "message",
                "from": "group",
                "group": group,
                "dataType": "json",
                "data": {
                    "messageId": message_id,
                    "message": chunk,
                    "from": from_user_id,
                    "streaming": True
                },
                "fromUserId": from_user_id
            }
            await self.client_manager.send_to_group(group, json.dumps(group_data), exclude_ids)
            await asyncio.sleep(0.05)
        # send end-of-stream marker
        group_data = {
            "type": "message",
            "from": "group",
            "group": group,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "streaming": True,
                "streamingEnd": True,
                "from": from_user_id
            },
            "fromUserId": from_user_id
        }
        
        await self.client_manager.send_to_group(group, json.dumps(group_data), exclude_ids)
        return full_response

    async def add_to_group(self, connection_id: str, group: str) -> None:
        await self.client_manager.add_client_to_group(connection_id, group)

    async def remove_from_group(self, connection_id: str, group: str) -> None:
        await self.client_manager.remove_client_from_group(connection_id, group)

    # ------------------------- emit helpers -------------------------
    async def _emit(self, handlers: List[Callable[..., Union[Awaitable[None], None]]], *args: Any) -> None:
        for h in list(handlers):
            try:
                res = h(*args, self)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:  # noqa: BLE001
                # Errors in user callbacks should not bring the server down
                self.log.exception("Callback error in %r", h)

# ==================================================================
# Quick usage
# ==================================================================

async def main():
    svc = ChatService()

    @svc.on_connected
    def handle_connected(conn, _svc):
        print("connected:", conn.connectionId)

    @svc.on_event_message
    async def handle_event_message(conn, event_name, text, _svc):
        print(f"< {conn.connectionId} [{event_name}]: {text}")

    await svc.start_chat("0.0.0.0", 8765)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
