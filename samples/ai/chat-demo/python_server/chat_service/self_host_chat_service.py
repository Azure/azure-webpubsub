"""Self-hosted WebSocket ChatService implementation."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Optional, List, AsyncIterator
import logging
import websockets.exceptions as ws_exc
from websockets.server import WebSocketServerProtocol, serve as ws_serve, Subprotocol

from ..core.utils import generate_id
from ..core.room_store import RoomStore
from .base import (
    ChatServiceBase,
    ClientConnectionContext,
    as_room_group,
    try_room_id_from_group,
    SYS_ROOMS_GROUP,
)

supported_protocol_names = (
    'json.reliable.webpubsub.azure.v1',
    'json.webpubsub.azure.v1',
)

supported_protocols: tuple[Subprotocol, ...] = tuple(
    Subprotocol(name) for name in supported_protocol_names
)

from dataclasses import dataclass
from typing import Dict, Set, Any, Iterable, Optional as Opt, List as TList

@dataclass
class SendResult:
    connection_id: str
    ok: bool
    error: str | None = None

class _InMemoryClientManager:
    """In-process client + group registry used by the self-host transport.

    Thread-safety: Designed for single asyncio event loop usage. No locks.
    """
    def __init__(self, *, logger: logging.Logger | None = None) -> None:  # noqa: D401
        self._clients: Dict[str, tuple[ClientConnectionContext, Any]] = {}
        self._groups: Dict[str, Set[str]] = {}
        self._logger = logger

    async def add_client(self, connection_id: str, context: ClientConnectionContext, transport: Any) -> None:
        self._clients[connection_id] = (context, transport)

    async def remove_client(self, connection_id: str) -> None:
        self._clients.pop(connection_id, None)
        # Drop from all groups + prune empties
        for g in list(self._groups):
            members = self._groups[g]
            if connection_id in members:
                members.discard(connection_id)
                if not members:
                    self._groups.pop(g, None)

    async def add_client_to_group(self, connection_id: str, group: str) -> None:
        self._groups.setdefault(group, set()).add(connection_id)

    async def remove_client_from_group(self, connection_id: str, group: str) -> None:
        members = self._groups.get(group)
        if members:
            members.discard(connection_id)
            if not members:
                self._groups.pop(group, None)

    async def send_to_group(self, group: str, data: str, exclude_ids: Opt[Iterable[str]] = None) -> TList[SendResult]:
        results: TList[SendResult] = []
        members = self._groups.get(group, set())
        for cid in list(members):  # iterate over snapshot
            if exclude_ids and cid in exclude_ids:
                continue
            ctx_ws = self._clients.get(cid)
            if not ctx_ws:
                continue
            _ctx, ws = ctx_ws
            try:
                await ws.send(data)
                results.append(SendResult(cid, True))
            except Exception as e:  # noqa: BLE001
                results.append(SendResult(cid, False, str(e)))
        return results

    # Introspection helpers (not part of external contract, but useful for tests)
    def group_members(self, group: str) -> Set[str]:
        return set(self._groups.get(group, set()))
    def client_ids(self) -> Set[str]:
        return set(self._clients.keys())

class ChatService(ChatServiceBase):
    def __init__(
        self,
        *,
        client_manager: Optional[_InMemoryClientManager] = None,
        room_store: Optional[RoomStore] = None,
        logger: Optional[logging.Logger] = None,
        max_message_size: Optional[int] = 2 ** 20,
        host: str = "0.0.0.0",
        port: int = 8765,
        public_endpoint: str | None = None,
    ) -> None:
        super().__init__(room_store=room_store, logger=logger)
        self.client_manager = client_manager or _InMemoryClientManager(logger=self.log)
        self.max_message_size = max_message_size
        from typing import Any as _Any
        self._server: _Any | None = None
        self._host = host
        self._port = port
        self._public_endpoint = public_endpoint or f"ws://{host}:{port}"

    def negotiate(self) -> str:
        return f"{self._public_endpoint}/ws"

    async def start_chat(self, host: str | None = None, port: int | None = None) -> None:
        # if caller provided explicit host/port use them; else fall back to ctor values
        host = host or self._host
        port = port or self._port
        async def handler(ws: WebSocketServerProtocol, path: str) -> None:
            selected_subprotocol = ws.subprotocol
            remote = getattr(ws, "remote_address", None)
            self.log.info("New WS connection from %s (subprotocol=%r path=%s)", remote, selected_subprotocol, path)
            if selected_subprotocol not in supported_protocol_names:
                await ws.close()
                return
            connection_id = generate_id('conn-')
            client = ClientConnectionContext(path, connection_id)
            try:
                await self._emit(self._on_connecting, client)
                await self.client_manager.add_client(connection_id, client, ws)
                await self._emit(self._on_connected, client)
                await ws.send(json.dumps({
                    "type": "system",
                    "event": "connected",
                    "connectionId": connection_id,
                    "userId": client.user_id,
                    "subprotocol": selected_subprotocol
                }))
                async for message in ws:
                    try:
                        data = json.loads(message)
                        if data.get('type') == 'event':
                            message_data = data.get('data', {})
                            user_message = message_data.get('message', '') if isinstance(message_data, dict) else str(message_data)
                            event_name = data.get('event')
                            if not user_message.strip():
                                continue
                            await self._emit(self._on_event_message, client, event_name, message_data)
                        elif data.get('type') == 'sendToGroup':
                            message_data = data.get('data', {})
                            user_message = message_data.get('message', '') if isinstance(message_data, dict) else str(message_data)
                            user_name = message_data.get('from')
                            group_name = message_data.get('group')
                            no_echo = message_data.get('noEcho', False)
                            if not user_message.strip():
                                continue
                            room_id = try_room_id_from_group(group_name)
                            if room_id:
                                try:
                                    await self.room_store.record_room_event(room_id, {
                                        "type": "message",
                                        "messageId": generate_id("m-"),
                                        "from": user_name,
                                        "message": user_message,
                                        "timestamp": datetime.now(timezone.utc).isoformat(),
                                    })
                                    message_data["roomId"] = room_id
                                except Exception:
                                    pass
                            await self.client_manager.send_to_group(group_name, json.dumps({
                                "type": "message",
                                "from": "group",
                                "group": group_name,
                                "dataType": "json",
                                "data": message_data,
                                "fromUserId": user_name,
                            }), [connection_id] if no_echo else [])
                        elif data.get('type') == 'joinGroup':
                            group_name = data.get('group')
                            if group_name is None:
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": False, "error": "Group name is required"}
                            else:
                                await self.client_manager.add_client_to_group(connection_id, group_name)
                                room_id = try_room_id_from_group(group_name)
                                if room_id:
                                    try:
                                        await self.room_store.register_room(room_id)
                                    except Exception:
                                        pass
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                                await self.notify_rooms_changed()
                            await ws.send(json.dumps(ack_message))
                        elif data.get('type') == 'leaveGroup':
                            group_name = data.get('group')
                            if group_name is None:
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": False, "error": "Group name is required"}
                            else:
                                await self.client_manager.remove_client_from_group(connection_id, group_name)
                                try:
                                    room_id = try_room_id_from_group(group_name)
                                    if room_id:
                                        await self.room_store.remove_room_if_empty(room_id)
                                except Exception:
                                    pass
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                                await self.notify_rooms_changed()
                            await ws.send(json.dumps(ack_message))
                        elif data.get('type') == 'sequenceAck':
                            continue
                        else:
                            self.log.warning("Unknown message type: %s", message)
                    except json.JSONDecodeError:
                        self.log.warning("Invalid JSON received")
                    except Exception as e:
                        self.log.error("Error handling message: %s", e)
            except ws_exc.ConnectionClosed as e:
                self.log.info("WebSocket connection closed remote=%s code=%s reason=%r", remote, e.code, e.reason)
                raise
            except Exception as exc:
                self.log.exception("Error in WebSocket handler for %s: %s", remote, exc)
                await self._emit(self._on_error, client, exc)
                raise
            finally:
                code = getattr(ws, "close_code", None)
                reason = getattr(ws, "close_reason", None)
                closed = getattr(ws, "closed", None)
                self.log.info("WS finalized remote=%s closed=%s code=%s reason=%r", remote, closed, code, reason)
                await self.client_manager.remove_client(connection_id)
                await self._emit(self._on_disconnected, client)
        
        self.log.info("Starting WebSocket server on %s:%s", host, port)
        self._server = await ws_serve(
            handler,
            host,
            port,
            subprotocols=supported_protocols,
            ping_interval=None,
            ping_timeout=None,
            max_size=self.max_message_size,
        )
        self.log.info("WebSocket server started successfully on %s:%s", host, port)
        try:
            await self._server.wait_closed()
        finally:
            self.log.info("ChatService stopped")

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def send_to_group(self, group: str, message: str, exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> List[SendResult]:
        room_id = group
        group_name = as_room_group(room_id)
        message_id = generate_id("m-")
        payload = {
            "type": "message",
            "from": "group",
            "group": group_name,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "message": message,
                "from": from_user_id,
                "roomId": room_id
            },
            "fromUserId": from_user_id
        }
        try:
            await self.room_store.record_room_event(room_id, {
                "type": "message",
                "messageId": message_id,
                "from": from_user_id,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            self.log.debug("Failed to record room event for room %r", room_id)
        return await self.client_manager.send_to_group(group_name, json.dumps(payload), exclude_ids)

    async def streaming_to_group(self, group: str, chunks: AsyncIterator[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> str:
        room_id = group
        group_name = as_room_group(room_id)
        full_response = ""
        message_id = generate_id("m-")
        async for chunk in chunks:
            full_response += chunk
            group_data = {
                "type": "message",
                "from": "group",
                "group": group_name,
                "dataType": "json",
                "data": {
                    "messageId": message_id,
                    "message": chunk,
                    "from": from_user_id,
                    "streaming": True,
                    "roomId": room_id
                },
                "fromUserId": from_user_id
            }
            await self.client_manager.send_to_group(group_name, json.dumps(group_data), exclude_ids)
            await asyncio.sleep(0.05)
        eos = {
            "type": "message",
            "from": "group",
            "group": group_name,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "streaming": True,
                "streamingEnd": True,
                "from": from_user_id,
                "roomId": room_id
            },
            "fromUserId": from_user_id
        }
        await self.client_manager.send_to_group(group_name, json.dumps(eos), exclude_ids)
        try:
            await self.room_store.record_room_event(room_id, {
                "type": "message",
                "messageId": message_id,
                "message": full_response,
                "from": from_user_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            self.log.debug("Failed to record stream end for room %r", room_id)
        return full_response

    async def add_to_group(self, connection_id: str, group: str) -> None:
        room_id = group
        group_name = as_room_group(room_id)
        await self.client_manager.add_client_to_group(connection_id, group_name)
        try:
            await self.room_store.register_room(room_id)
        except Exception:
            pass
        await self.notify_rooms_changed()

    async def remove_from_group(self, connection_id: str, group: str) -> None:
        await self.client_manager.remove_client_from_group(connection_id, group)

    async def notify_rooms_changed(self) -> None:
        try:
            rooms = await self.room_store.list_rooms()
            payload = {
                "type": "message",
                "from": "group",
                "group": SYS_ROOMS_GROUP,
                "dataType": "json",
                "data": {"type": "rooms-changed", "rooms": rooms},
            }
            await self.client_manager.send_to_group(SYS_ROOMS_GROUP, json.dumps(payload))
        except Exception:
            self.log.debug("Failed to notify rooms-changed")
