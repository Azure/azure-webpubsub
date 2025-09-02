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
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple, Union, AsyncIterator
from utils import generate_id
import websockets
import websockets.exceptions as ws_exc
from websockets.server import WebSocketServerProtocol
from client_managers import ClientManager, InMemoryClientManager, SendResult
from room_store import RoomStore, InMemoryRoomStore

# enable verbose websockets logging while debugging (optional)
logging.basicConfig(level=logging.DEBUG)
logging.getLogger("websockets").setLevel(logging.INFO)

class ClientConnectionContext:
    """The basic properties for the client connection.

    Handlers can mutate this context during the 'connecting' phase to add
    metadata like userId, roles, etc., before the connection is registered.
    """
    def __init__(self, path, connection_id, *, user_id: Optional[str] = None, attrs: Optional[Dict[str, Any]] = None) -> None:
        self.path = path
        self.connectionId = connection_id
        self.user_id: Optional[str] = user_id
        self.attrs: Dict[str, Any] = attrs or {}

# ------------------------------ Types ------------------------------
OnConnecting = Callable[[ClientConnectionContext, "ChatService"], Union[Awaitable[None], None]]
OnConnected = Callable[[ClientConnectionContext, "ChatService"], Union[Awaitable[None], None]]
OnDisconnected = Callable[[ClientConnectionContext, "ChatService"], Union[Awaitable[None], None]]
OnEventMessage = Callable[[ClientConnectionContext, str, str, "ChatService"], Union[Awaitable[None], None]]  # (connection_id, event_name, message, svc)
OnError = Callable[[ClientConnectionContext, BaseException, "ChatService"], Union[Awaitable[None], None]]


# ClientManager implementations moved to client_managers.py


async def _wait_for(awaitable: Awaitable[Any], timeout: Optional[float]) -> Any:
    if timeout is None:
        return await awaitable
    return await asyncio.wait_for(awaitable, timeout)


# ==================================================================
# ChatService
# ==================================================================

supported_protocols = ['json.reliable.webpubsub.azure.v1', 'json.webpubsub.azure.v1']

# Group naming scheme
ROOM_GROUP_PREFIX = "room_"
SYS_GROUP_PREFIX = "sys_"
SYS_ROOMS_GROUP = "sys_rooms"

def as_room_group(room_id: str) -> str:
    return f"{ROOM_GROUP_PREFIX}{room_id}"

def try_room_id_from_group(group_name: Optional[str]) -> Optional[str]:
    if isinstance(group_name, str) and group_name.startswith(ROOM_GROUP_PREFIX):
        return group_name[len(ROOM_GROUP_PREFIX):]
    return None

class ChatService:
    def __init__(
        self,
        *,
    client_manager: Optional[ClientManager] = None,
        room_store: Optional[RoomStore] = None,
        logger: Optional[logging.Logger] = None,
        max_message_size: Optional[int] = 2 ** 20,  # 1 MiB
    ) -> None:
        self.log = logger or logging.getLogger("chat_service")
        self.client_manager = client_manager or InMemoryClientManager(logger=self.log)
        self.room_store = room_store or InMemoryRoomStore()
        self.max_message_size = max_message_size
        self._server = None
        # event handlers
        self._on_connecting = []
        self._on_connected = []
        self._on_disconnected = []
        self._on_event_message = []
        self._on_error = []

    # ---------------------- event registration ----------------------
    def on(self, event: str, handler: Callable[..., Union[Awaitable[None], None]]) -> None:
        if event == "connecting":
            self._on_connecting.append(handler)  # type: ignore[arg-type]
        elif event == "connected":
            self._on_connected.append(handler)  # type: ignore[arg-type]
        elif event == "disconnected":
            self._on_disconnected.append(handler)  # type: ignore[arg-type]
        elif event == "event_message":
            self._on_event_message.append(handler)  # type: ignore[arg-type]
        elif event == "error":
            self._on_error.append(handler)  # type: ignore[arg-type]
        else:
            raise ValueError(f"Unknown event: {event}")
        
    def on_connecting(self, handler: OnConnecting) -> None:
        """Register a handler invoked right after context creation and before registration.

        Use to enrich `ClientConnectionContext` (e.g., set `userId`) or perform
        lightweight auth checks. Raise to abort the connection.
        """
        self.on("connecting", handler)

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
            remote = getattr(ws, "remote_address", None)
            self.log.info("New WS connection from %s (subprotocol=%r path=%s)", remote, selected_subprotocol, path)
           
            if selected_subprotocol not in supported_protocols:
                print(f"Unsupported subprotocol: {selected_subprotocol}")
                await ws.close()
                return
            connection_id = generate_id('conn-')
            client = ClientConnectionContext(path, connection_id)
            try:
                # Allow hooks to enrich/mutate the client context before registration
                await self._emit(self._on_connecting, client)
                await self.client_manager.add_client(connection_id, client, ws)
                await self._emit(self._on_connected, client)

                connected_event = {
                    "type": "system", 
                    "event": "connected", 
                    "connectionId": connection_id,
                    "userId": client.user_id,
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
                            # Best-effort persistence if this is a room group
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
                                except Exception:
                                    pass
                                # Ensure the outgoing payload also carries roomId for clients
                                try:
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
                                self.log.warning(f"Invalid group name: {group_name}")
                            else:
                                await self.client_manager.add_client_to_group(connection_id, group_name)
                                # If it's a room group, register room in store
                                room_id = try_room_id_from_group(group_name)
                                if room_id:
                                    try:
                                        await self.room_store.register_room(room_id)
                                    except Exception:
                                        pass
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                                self.log.info(f"Client joined group: {group_name}")
                                # notify listeners that room list may have changed
                                await self.notify_rooms_changed()
                            await ws.send(json.dumps(ack_message))
                        elif data.get('type') == 'leaveGroup':
                            group_name = data.get('group')
                            if group_name is None:
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": False, "error": "Group name is required"}
                                self.log.warning(f"Invalid group name: {group_name}")
                            else:
                                await self.client_manager.remove_client_from_group(connection_id, group_name)
                                try:
                                    # Opportunistic prune for empty/no-history rooms
                                    room_id = try_room_id_from_group(group_name)
                                    if room_id:
                                        await self.room_store.remove_room_if_empty(room_id)
                                except Exception:
                                    pass
                                ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                                self.log.info(f"Client left group: {group_name}")
                                # notify listeners that room list may have changed
                                await self.notify_rooms_changed()
                            await ws.send(json.dumps(ack_message))
                        elif data.get('type') == 'sequenceAck':
                            continue
                        else:
                            self.log.warning(f"Unknown message type: {message}")
                    except json.JSONDecodeError:
                        self.log.warning("Invalid JSON received")
                    except Exception as e:
                        self.log.error(f"Error handling message: {e}")
            except ws_exc.ConnectionClosed as e:
                # explicit close from client or network — log details
                self.log.info("WebSocket connection closed (client/network) remote=%s code=%s reason=%r", remote, e.code, e.reason)
                # re-raise if you want finally to run removal/_emit (finally still runs)
                raise
            except Exception as exc:
                self.log.exception("Error in WebSocket handler for %s: %s", remote, exc)
                await self._emit(self._on_error, client, exc)
                raise
            finally:
                # Log protocol-level close details (available after close)
                code = getattr(ws, "close_code", None)
                reason = getattr(ws, "close_reason", None)
                closed = getattr(ws, "closed", None)
                self.log.info("WS finalized: remote=%s closed=%s code=%s reason=%r", remote, closed, code, reason)
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
        # Interpret 'group' as room id and map to room_ group for transport
        room_id = group
        group_name = as_room_group(room_id)
        group_data = {
            "type": "message",
            "from": "group",
            "group": group_name,
            "dataType": "json",
            "data": {
                "messageId": generate_id("m-"),
                "message": message,
                "from": from_user_id,
                # include room routing info inside data for clients that don't expose top-level group
                "roomId": room_id
            },
            "fromUserId": from_user_id
        }
        # persist a simplified event for the room
        try:
            await self.room_store.record_room_event(room_id, {
                "type": "message",
                "messageId": group_data["data"]["messageId"],
                "from": from_user_id,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            self.log.debug("Failed to record room event for room %r", room_id)
        return await self.client_manager.send_to_group(group_name, json.dumps(group_data), exclude_ids)
    
    async def streaming_to_group(self, group: str, chunks: AsyncIterator[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> List[SendResult]:
        # Interpret 'group' as room id and map to room_ group for transport
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
                    # include room routing info inside data for clients that don't expose top-level group
                    "roomId": room_id
                },
                "fromUserId": from_user_id
            }
            self.log.debug("Sending streaming chunk to group %r: %r", group, chunk)
            await self.client_manager.send_to_group(group_name, json.dumps(group_data), exclude_ids)
            await asyncio.sleep(0.05)
        # send end-of-stream marker
        group_data = {
            "type": "message",
            "from": "group",
            "group": group_name,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "streaming": True,
                "streamingEnd": True,
                "from": from_user_id,
                # include room routing info inside data for clients that don't expose top-level group
                "roomId": room_id
            },
            "fromUserId": from_user_id
        }
        
        await self.client_manager.send_to_group(group_name, json.dumps(group_data), exclude_ids)
        self.log.debug("Complete streaming chunk to group %r", group)
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
        # Interpret 'group' as room id and map to room_ group for transport
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
        """Send a rooms-changed notification to the special _rooms group without persisting history."""
        try:
            rooms = await self.room_store.list_rooms()
            payload = {
                "type": "message",
                "from": "group",
                "group": SYS_ROOMS_GROUP,
                "dataType": "json",
                "data": {
                    "type": "rooms-changed",
                    "rooms": rooms,
                },
            }
            await self.client_manager.send_to_group(SYS_ROOMS_GROUP, json.dumps(payload))
        except Exception:
            self.log.debug("Failed to notify rooms-changed")

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
