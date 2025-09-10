"""Chat services: abstract interface + self-hosted + Azure Web PubSub.

This module now contains:
- ChatServiceBase: abstract event/callback contract for chat services
- ChatService: self-hosted WebSocket implementation (kept as default)
- WebPubSubChatService: Azure Web PubSub service-backed implementation

Self-hosted ChatService provides:
- `start_chat(host, port)` – start a WebSocket server (asyncio)
- `stop()` – graceful shutdown
- Callback hooks: `.on_connecting(cb)`, `.on_connected(cb)`, `.on_disconnected(cb)`, `.on_event_message(cb)`, `.on_error(cb)`
- Broadcast APIs using an in-memory, lock-safe `InMemoryClientManager`
- No external frameworks beyond `websockets` for transport

Notes
- This is **process-local**. For multi-process deployments, use a shared backend (e.g., Redis) for fan-out.
- All callbacks may be **sync or async**; we `await` coroutine callbacks and call sync ones directly.
- We never await while holding the client registry lock.
"""
from __future__ import annotations

import asyncio
from http import client
import logging
import json
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple, Union, AsyncIterator
from utils import generate_id
import websockets
import websockets.exceptions as ws_exc
from websockets.server import WebSocketServerProtocol
from client_manager import ClientManager, InMemoryClientManager, SendResult
from room_store import RoomStore, InMemoryRoomStore

# Optional Azure Web PubSub (service) SDK
try:  # noqa: SIM105
    from azure.identity import DefaultAzureCredential  # type: ignore
    from azure.messaging.webpubsubservice import WebPubSubServiceClient  # type: ignore
except Exception:  # noqa: BLE001
    DefaultAzureCredential = None  # type: ignore[assignment]
    WebPubSubServiceClient = None  # type: ignore[assignment]

# enable verbose websockets logging while debugging (optional)
logging.basicConfig(level=logging.DEBUG)
logging.getLogger("websockets").setLevel(logging.INFO)

class ClientConnectionContext:
    """The basic properties for the client connection.

    Handlers can mutate this context during the 'connecting' phase to add
    metadata like userId, roles, etc., before the connection is registered.
    """
    def __init__(self, query: str, connection_id: str, *, user_id: Optional[str] = None, attrs: Optional[Dict[str, Any]] = None) -> None:
        self.query = query
        self.connectionId = connection_id
        self.user_id: Optional[str] = user_id
        self.attrs: Dict[str, Any] = attrs or {}

# ------------------------------ Types ------------------------------
# Forward-declare base type name for annotations without importing at top
class _BaseType:  # pragma: no cover - for typing only
    pass

OnConnecting = Callable[[ClientConnectionContext, "_BaseType"], Union[Awaitable[None], None]]
OnConnected = Callable[[ClientConnectionContext, "_BaseType"], Union[Awaitable[None], None]]
OnDisconnected = Callable[[ClientConnectionContext, "_BaseType"], Union[Awaitable[None], None]]
OnEventMessage = Callable[[ClientConnectionContext, str, Any, "_BaseType"], Union[Awaitable[None], None]]
OnError = Callable[[ClientConnectionContext, BaseException, "_BaseType"], Union[Awaitable[None], None]]


# ClientManager implementations moved to client_manager.py


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

class ChatServiceBase:
    """Abstract base for chat services. Provides event management.

    Concrete implementations must implement transport-specific methods.
    """
    def __init__(
        self,
        *,
        room_store: Optional[RoomStore] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        self.log = logger or logging.getLogger("chat_service")
        self.room_store = room_store or InMemoryRoomStore()
        # event handlers
        self._on_connecting: List[OnConnecting] = []
        self._on_connected: List[OnConnected] = []
        self._on_disconnected: List[OnDisconnected] = []
        self._on_event_message: List[OnEventMessage] = []
        self._on_error: List[OnError] = []

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
        self.on("connecting", handler)

    def on_connected(self, handler: OnConnected) -> None:
        self.on("connected", handler)

    def on_disconnected(self, handler: OnDisconnected) -> None:
        self.on("disconnected", handler)

    def on_event_message(self, handler: OnEventMessage) -> None:
        self.on("event_message", handler)

    def on_error(self, handler: OnError) -> None:
        self.on("error", handler)

    # ------------------------- emit helpers -------------------------
    async def _emit(self, handlers: List[Callable[..., Union[Awaitable[None], None]]], *args: Any) -> None:
        for h in list(handlers):
            try:
                res = h(*args, self)  # type: ignore[misc]
                if asyncio.iscoroutine(res):
                    await res
            except Exception:  # noqa: BLE001
                # Errors in user callbacks should not bring the server down
                self.log.exception("Callback error in %r", h)

    # -------------------- abstract transport API --------------------
    async def start_chat(self, host: str = "0.0.0.0", port: int = 8765) -> None:
        raise NotImplementedError

    async def stop(self) -> None:
        raise NotImplementedError

    async def send_to_group(self, group: str, message: str, exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> List[SendResult] | Any:
        raise NotImplementedError
    
    async def streaming_to_group(self, group: str, chunks: AsyncIterator[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> str:
        """Stream a sequence of text chunks to a room/group.

        Contract:
            - Each chunk is emitted immediately to clients with streaming=True.
            - After the iterator completes, a final marker (streamingEnd=True) is sent.
            - Implementations MAY persist the concatenated text as a single message event.
            - Returns the full concatenated response string.
        """
        raise NotImplementedError

    async def add_to_group(self, connection_id: str, group: str) -> None:
        raise NotImplementedError

    async def remove_from_group(self, connection_id: str, group: str) -> None:
        raise NotImplementedError

    async def notify_rooms_changed(self) -> None:
        raise NotImplementedError


class ChatService(ChatServiceBase):
    def __init__(
        self,
        *,
        client_manager: Optional[ClientManager] = None,
        room_store: Optional[RoomStore] = None,
        logger: Optional[logging.Logger] = None,
        max_message_size: Optional[int] = 2 ** 20,  # 1 MiB
    ) -> None:
        super().__init__(room_store=room_store, logger=logger)
        self.client_manager = client_manager or InMemoryClientManager(logger=self.log)
        self.max_message_size = max_message_size
        self._server = None

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
    
    async def streaming_to_group(self, group: str, chunks: AsyncIterator[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> str:
        # Interpret 'group' as room id and map to room_ group for transport
        room_id = group
        group_name = as_room_group(room_id)
        self.log.debug("Starting streaming to group %r", group)
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


# ==================================================================
# Azure Web PubSub service-backed implementation
# ==================================================================

class WebPubSubChatService(ChatServiceBase):
    """Azure Web PubSub-backed chat service.

    This implementation does not host a local WebSocket server. Clients should
    connect directly to Azure Web PubSub using a client access URL (token).
    Use the Python SDK to broadcast to groups and persist room history locally
    using the provided RoomStore.
    """

    def __init__(
        self,
        *,
        hub: str = "chat",
        connection_string: Optional[str] = None,
        endpoint: Optional[str] = None,
        credential: Any | None = None,
        room_store: Optional[RoomStore] = None,
        logger: Optional[logging.Logger] = None,
    ) -> None:
        super().__init__(room_store=room_store, logger=logger)
        if WebPubSubServiceClient is None:
            raise RuntimeError("azure-messaging-webpubsubservice is not installed. Please `pip install azure-messaging-webpubsubservice`. ")
        # Prefer endpoint + DefaultAzureCredential when available; support connection string as fallback
        if endpoint:
            if credential is None:
                if DefaultAzureCredential is None:
                    raise RuntimeError("azure-identity is not installed. Please `pip install azure-identity` or pass a credential.")
                credential = DefaultAzureCredential()
            self._svc = WebPubSubServiceClient(endpoint=endpoint, hub=hub, credential=credential)  # type: ignore[call-arg]
        elif connection_string:
            self._svc = WebPubSubServiceClient.from_connection_string(connection_string, hub=hub)  # type: ignore[attr-defined]
        else:
            raise RuntimeError("WebPubSubChatService requires either endpoint (+ Azure credential) or connection_string")

        # Minimal internal client registry used only for CloudEvents lifecycle callbacks.
        # We intentionally do NOT try to mirror full Azure connection state; we just
        # retain contexts between sys.connect -> sys.connected -> sys.disconnected events.
        self._http_clients: Dict[str, ClientConnectionContext] = {}

        class _SimpleClientManager:
            def __init__(inner_self):
                inner_self._parent = self
            async def add_client(inner_self, connection_id: str, context: ClientConnectionContext, _transport: Any) -> None:  # noqa: D401
                inner_self._parent._http_clients[connection_id] = context
            async def get_client(inner_self, connection_id: str) -> Optional[ClientConnectionContext]:
                return inner_self._parent._http_clients.get(connection_id)
            async def remove_client(inner_self, connection_id: str) -> None:
                inner_self._parent._http_clients.pop(connection_id, None)

        # Expose with same name used by self-host path to reuse handler logic.
        self.client_manager = _SimpleClientManager()  # type: ignore[attr-defined]

    # No local server to start; return immediately
    async def start_chat(self, host: str = "0.0.0.0", port: int = 0) -> None:  # type: ignore[override]
        self.log.info("WebPubSubChatService ready (no local WebSocket server)")

    async def stop(self) -> None:  # type: ignore[override]
        # SDK is stateless for service operations
        return

    # ------------- negotiation helper (service client URL) ------------
    def get_client_access_url(self, *, user_id: Optional[str] = None) -> str:
        try:
            # give the client permissions to join groups and send messages
            token = self._svc.get_client_access_token(user_id=user_id, roles=["webpubsub.joinLeaveGroup", "webpubsub.sendToGroup"])
            # The SDK returns a dict-like object with 'url'
            url = token.get('url') if isinstance(token, dict) else getattr(token, 'url', None)
            if not url:
                raise RuntimeError("Failed to obtain client access URL from Web PubSub service client")
            return url
        except Exception as e:  # noqa: BLE001
            raise

    async def send_to_group(self, group: str, message: str, exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None):  # type: ignore[override]
        # Interpret 'group' as room id and use Azure group name `room_{id}` for consistency with self-host
        room_id = group
        group_name = as_room_group(room_id)
        payload = {
                "messageId": generate_id("m-"),
                "message": message,
                "from": from_user_id,
                "roomId": room_id,
        }
        try:
            # Persist simplified event locally
            await self.room_store.record_room_event(room_id, {
                "type": "message",
                "messageId": payload["messageId"],
                "from": from_user_id,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            self.log.debug("Failed to record room event for room %r", room_id)

        # Exclusion by connection id is optional in service API; ignore if not supported
        try:
            if exclude_ids:
                self._svc.send_to_group(group_name, json.dumps(payload), content_type="application/json", excluded=exclude_ids)  # type: ignore[call-arg]
            else:
                self._svc.send_to_group(group_name, json.dumps(payload), content_type="application/json")  # type: ignore[call-arg]
        except TypeError:
            # Older SDKs may not support `excluded`/content_type keyword
            self._svc.send_to_group(group_name, json.dumps(payload))  # type: ignore[call-arg]
        return []

    async def streaming_to_group(self, group: str, chunks: AsyncIterator[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> str:  # type: ignore[override]
        room_id = group
        group_name = as_room_group(room_id)
        self.log.debug("Starting streaming to group %r (service)", group)
        full_response = ""
        message_id = generate_id("m-")
        chunk_index = 0
        async for chunk in chunks:
            full_response += chunk
            payload = {
                    "messageId": message_id,
                    "message": chunk,
                    "from": from_user_id,
                    "streaming": True,
                    "roomId": room_id,
            }
            chunk_index += 1
            self.log.debug("[service] Streaming chunk #%d to %r: %r", chunk_index, group, chunk)
            self._svc.send_to_group(group_name, payload, content_type="application/json", excluded=exclude_ids)  # type: ignore[call-arg]
            await asyncio.sleep(0.05)

        # end-of-stream marker
        eos_payload = {
                "messageId": message_id,
                "streaming": True,
                "streamingEnd": True,
                "from": from_user_id,
                "roomId": room_id,
        }
        try:
            if exclude_ids:
                self._svc.send_to_group(group_name, json.dumps(eos_payload), content_type="application/json", excluded=exclude_ids)  # type: ignore[call-arg]
            else:
                self._svc.send_to_group(group_name, json.dumps(eos_payload), content_type="application/json")  # type: ignore[call-arg]
        except TypeError:
            self._svc.send_to_group(group_name, json.dumps(eos_payload))  # type: ignore[call-arg]
        self.log.debug("[service] Completed streaming to %r: %d chunks, %d chars total", group, chunk_index, len(full_response))
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

    async def add_to_group(self, connection_id: str, group: str) -> None:  # type: ignore[override]
        # Group membership should be driven by clients directly when using Web PubSub.
        # Optionally, the service API allows adding a known connectionId to a group.
        try:
            self._svc.add_connection_to_group(as_room_group(group), connection_id)  # type: ignore[attr-defined]
        except Exception:
            # Best-effort; often you don't have the connectionId on the server.
            pass

    async def remove_from_group(self, connection_id: str, group: str) -> None:  # type: ignore[override]
        try:
            self._svc.remove_connection_from_group(as_room_group(group), connection_id)  # type: ignore[attr-defined]
        except Exception:
            pass

    async def notify_rooms_changed(self) -> None:  # type: ignore[override]
        try:
            rooms = await self.room_store.list_rooms()
            payload = {
                    "type": "rooms-changed",
                    "rooms": rooms,
            }
            try:
                self._svc.send_to_group(SYS_ROOMS_GROUP, json.dumps(payload), content_type="application/json")  # type: ignore[call-arg]
            except TypeError:
                self._svc.send_to_group(SYS_ROOMS_GROUP, json.dumps(payload))  # type: ignore[call-arg]
        except Exception:
            self.log.debug("Failed to notify rooms-changed (service)")

    # ----------------- CloudEvents (single endpoint) -----------------
    def attach_flask_cloudevents(self, flask_app, loop, path: str = '/eventhandler') -> None:
        """Register a single CloudEvents-compatible webhook endpoint.

        CloudEvents headers of interest:
          ce-type: azure.webpubsub.sys.connected | azure.webpubsub.sys.disconnected | azure.webpubsub.user.message | azure.webpubsub.user.<event>
          ce-userid: user id (if any)
          ce-connectionid: connection id (if any)
                System events invoke on_connected / on_disconnected callbacks best-effort with a synthetic context.
        """
        from flask import request, jsonify, Response  # type: ignore

        @flask_app.route(path, methods=['POST', 'OPTIONS'])
        async def _wps_cloudevents():  # type: ignore
            """Async CloudEvents handler; requires Flask installed with async extra.

            Handles connect / connected / disconnected / user.message events.
            Unknown events return 204 (ignored).
            """
            try:
                if request.method == 'OPTIONS':
                    if request.headers.get('WebHook-Request-Origin'):
                        resp = Response(status=200)
                        resp.headers['WebHook-Allowed-Origin'] = '*'
                        return resp
                    return ('', 400)

                ce_type = request.headers.get('ce-type', '')
                user_id = request.headers.get('ce-userid')
                connection_id = request.headers.get('ce-connectionid')
                if not connection_id or not ce_type:
                    return ('Bad Request', 400)
                self.log.debug("CloudEvent received: type=%s userId=%s connectionId=%s", ce_type, user_id, connection_id)

                if ce_type == 'azure.webpubsub.sys.connect':
                    query = request.get_json(silent=True) or {}
                    qs = query.get('query', {}) if isinstance(query, dict) else {}
                    client = ClientConnectionContext(qs, connection_id)
                    await self._emit(self._on_connecting, client)
                    await self.client_manager.add_client(connection_id, client, None)
                    if user_id == client.user_id:
                        return ('', 204)
                    else:
                        return (json.dumps({"userId": client.user_id}), 200, {'Content-Type': 'application/json'})

                if ce_type == 'azure.webpubsub.sys.connected':
                    client = await self.client_manager.get_client(connection_id)
                    if client is None:
                        return ('Connection not found', 404)
                    await self._emit(self._on_connected, client)
                    return ('', 204)

                if ce_type == 'azure.webpubsub.sys.disconnected':
                    print(f'{self._http_clients}')
                    client = await self.client_manager.get_client(connection_id)
                    if client is None:
                        return ('Connection not found', 404)
                    await self._emit(self._on_disconnected, client)
                    return ('', 204)

                if ce_type.startswith('azure.webpubsub.user.'):
                    client = await self.client_manager.get_client(connection_id)
                    if client is None:
                        return ('Connection not found', 404)
                    payload = request.get_json(silent=True) or {}
                    # Derive event name from ce-type suffix; fallback to ce-eventName header if present
                    derived_event = ce_type[len('azure.webpubsub.user.'):] or None
                    header_event = request.headers.get('ce-eventName')
                    event_name = header_event or derived_event
                    self.log.debug("User event received: event=%s connectionId=%s payload=%s", event_name, connection_id, payload)
                    await self._emit(self._on_event_message, client, event_name, payload)
                    return ('', 204, {'Content-Type': 'application/json'})

                return ('', 204)
            except Exception as e:  # noqa: BLE001
                self.log.warning('CloudEvents handler error: %s', e)
                return ('', 500)
