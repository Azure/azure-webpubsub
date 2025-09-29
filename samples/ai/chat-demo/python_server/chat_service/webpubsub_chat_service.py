"""Azure Web PubSub-backed ChatService implementation."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, List, AsyncIterator, Union, Tuple

from ..core.utils import generate_id
from ..core.room_store import RoomStore
from .base import ChatServiceBase, ClientConnectionContext, as_room_group, SYS_ROOMS_GROUP

DefaultAzureCredential = None  # sentinel if import missing
WebPubSubServiceClient = None  # sentinel if import missing
try:  # noqa: SIM105
    from azure.identity import DefaultAzureCredential as _DefaultAzureCredential  # pragma: no cover
    from azure.messaging.webpubsubservice import WebPubSubServiceClient as _WebPubSubServiceClient  # pragma: no cover
    DefaultAzureCredential = _DefaultAzureCredential
    WebPubSubServiceClient = _WebPubSubServiceClient
except Exception:  # noqa: BLE001
    pass

class WebPubSubChatService(ChatServiceBase):
    def __init__(
        self,
        *,
        hub: str = "chat",
        connection_string: Optional[str] = None,
        endpoint: Optional[str] = None,
        credential: Any | None = None,
        room_store: Optional[RoomStore] = None,
        logger: Optional[logging.Logger] = None,
        flask_app: Any | None = None,
        loop: asyncio.AbstractEventLoop | None = None,
        auto_attach_path: str = '/eventhandler',
    ) -> None:
        super().__init__(room_store=room_store, logger=logger)
        if WebPubSubServiceClient is None:
            raise RuntimeError("azure-messaging-webpubsubservice is not installed. Please `pip install azure-messaging-webpubsubservice`.")
        if endpoint:
            if credential is None:
                if DefaultAzureCredential is None:
                    raise RuntimeError("azure-identity is not installed. Please `pip install azure-identity` or pass a credential.")
                credential = DefaultAzureCredential()
            self._svc = WebPubSubServiceClient(endpoint=endpoint, hub=hub, credential=credential)
        elif connection_string:
            try:
                self._svc = WebPubSubServiceClient.from_connection_string(connection_string, hub=hub)  # type: ignore[attr-defined]
            except AttributeError:
                # Fallback older signature might differ; pass as connection string only
                self._svc = WebPubSubServiceClient.from_connection_string(connection_string)  # type: ignore[attr-defined]
        else:
            raise RuntimeError("WebPubSubChatService requires either endpoint (+ Azure credential) or connection_string")
        self._http_clients: Dict[str, ClientConnectionContext] = {}
        class _SimpleClientManager:
            """Minimal client registry for HTTP-originated (CloudEvents) connections.

            Only tracks contexts by connectionId; no websocket transport object exists.
            """
            def __init__(inner_self) -> None:  # noqa: D401
                inner_self._parent = self
            async def add_client(inner_self, connection_id: str, context: ClientConnectionContext, _transport: Any) -> None:
                inner_self._parent._http_clients[connection_id] = context
            async def get_client(inner_self, connection_id: str) -> Optional[ClientConnectionContext]:
                return inner_self._parent._http_clients.get(connection_id)
            async def remove_client(inner_self, connection_id: str) -> None:
                inner_self._parent._http_clients.pop(connection_id, None)
        self.client_manager = _SimpleClientManager()
        # Optionally auto-attach CloudEvents endpoint
        try:
            if flask_app is not None and loop is not None:
                self.attach_flask_cloudevents(flask_app, loop, path=auto_attach_path)
        except Exception:
            self.log.exception("Failed auto-attaching CloudEvents endpoint; continuing without it")

    def negotiate(self) -> str:
        return self.get_client_access_url()

    async def start_chat(self, host: str = "0.0.0.0", port: int = 0) -> None:
        self.log.info("WebPubSubChatService ready (service mode)")

    async def stop(self) -> None:
        return

    def get_client_access_url(self, *, user_id: Optional[str] = None) -> str:
        token = self._svc.get_client_access_token(user_id=user_id, roles=["webpubsub.joinLeaveGroup", "webpubsub.sendToGroup"])
        url_val: Any = token.get('url') if isinstance(token, dict) else getattr(token, 'url', None)
        if not isinstance(url_val, str):
            raise RuntimeError("Failed to obtain client access URL from Web PubSub service client")
        return url_val

    async def send_to_group(self, group: str, message: str, exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> List[Any]:
        room_id = group
        group_name = as_room_group(room_id)
        payload = {"messageId": generate_id("m-"), "message": message, "from": from_user_id, "roomId": room_id}
        try:
            await self.room_store.record_room_event(room_id, {
                "type": "message",
                "messageId": payload["messageId"],
                "from": from_user_id,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            self.log.debug("Failed to record room event for room %r", room_id)
        # NOTE:
        # The Python SDK will treat bytes as a binary payload, which causes clients using the
        # json(.reliable).webpubsub.azure.v1 subprotocol to receive base64-encoded 'data' with
        # dataType 'binary'. By sending a TEXT frame (str) with content_type application/json
        # we get a proper JSON decoding on the service side and clients see either:
        #   data: <object>, dataType: 'json'  (if protocol supports) OR dataType 'text' they can json parse.
        # Keep as str (NOT bytes) to avoid base64 in browsers.
        try:
            if exclude_ids:
                self._svc.send_to_group(group_name, payload, content_type="application/json", excluded=exclude_ids)  # type: ignore[arg-type]
            else:
                self._svc.send_to_group(group_name, payload, content_type="application/json")  # type: ignore[arg-type]
        except Exception:
            self.log.debug("Failed sending message to group %s", group_name)
        return []

    async def streaming_to_group(self, group: str, chunks: AsyncIterator[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> str:
        room_id = group
        group_name = as_room_group(room_id)
        full_response = ""
        message_id = generate_id("m-")
        chunk_index = 0
        async for chunk in chunks:
            full_response += chunk
            payload = {"messageId": message_id, "message": chunk, "from": from_user_id, "streaming": True, "roomId": room_id}
            chunk_index += 1
            try:
                self._svc.send_to_group(group_name, payload, content_type="application/json", excluded=exclude_ids)  # type: ignore[arg-type]
            except Exception:
                self.log.debug("Streaming chunk send failed (group=%s)", group_name)
            await asyncio.sleep(0.05)
        eos = {"messageId": message_id, "streaming": True, "streamingEnd": True, "from": from_user_id, "roomId": room_id}
        try:
            self._svc.send_to_group(group_name, eos, content_type="application/json")  # type: ignore[arg-type]
        except Exception:
            self.log.debug("Failed to send streaming end (group=%s)", group_name)
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
        try:
            self._svc.add_connection_to_group(as_room_group(group), connection_id)
        except Exception:
            pass

    async def remove_from_group(self, connection_id: str, group: str) -> None:
        try:
            self._svc.remove_connection_from_group(as_room_group(group), connection_id)
        except Exception:
            pass

    async def notify_rooms_changed(self) -> None:
        try:
            rooms = await self.room_store.list_rooms()
            payload = {"type": "rooms-changed", "rooms": rooms}
            self._svc.send_to_group(SYS_ROOMS_GROUP, payload, content_type="application/json")  # type: ignore[arg-type]
        except Exception:
            self.log.debug("Failed to notify rooms-changed (service)")

    # ----------------- CloudEvents (single endpoint) -----------------
    def attach_flask_cloudevents(self, flask_app: Any, loop: asyncio.AbstractEventLoop, path: str = '/eventhandler') -> None:
        from flask import request, Response
        @flask_app.route(path, methods=['POST', 'OPTIONS'])
        async def _wps_cloudevents() -> Union[Tuple[str, int], Tuple[str, int, Dict[str, str]]]:
            try:
                if request.method == 'OPTIONS':
                    if request.headers.get('WebHook-Request-Origin'):
                        return ('', 200, {'WebHook-Allowed-Origin': '*'})
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
                    client_opt = await self.client_manager.get_client(connection_id)
                    if client_opt is None:
                        return ('Connection not found', 404)
                    await self._emit(self._on_connected, client_opt)
                    return ('', 204)
                if ce_type == 'azure.webpubsub.sys.disconnected':
                    client_opt = await self.client_manager.get_client(connection_id)
                    if client_opt is None:
                        return ('Connection not found', 404)
                    await self._emit(self._on_disconnected, client_opt)
                    return ('', 204)
                if ce_type.startswith('azure.webpubsub.user.'):
                    client_opt = await self.client_manager.get_client(connection_id)
                    if client_opt is None:
                        return ('Connection not found', 404)
                    payload = request.get_json(silent=True) or {}
                    derived_event = ce_type[len('azure.webpubsub.user.'):]
                    header_event = request.headers.get('ce-eventName')
                    event_name = header_event or derived_event
                    self.log.debug("User event received: event=%s connectionId=%s payload=%s", event_name, connection_id, payload)
                    await self._emit(self._on_event_message, client_opt, event_name, payload)
                    return ('', 204, {'Content-Type': 'application/json'})
                return ('', 204)
            except Exception as e:  # noqa: BLE001
                self.log.warning('CloudEvents handler error: %s', e)
                return ('', 500)
