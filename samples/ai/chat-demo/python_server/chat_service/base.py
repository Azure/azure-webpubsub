"""Base abstractions and shared utilities for chat services.

Defines:
 - ClientConnectionContext
 - Event handler type aliases
 - ChatServiceBase abstract base class
 - Helper functions for group naming
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional, Union, AsyncIterator
from ..core import RoomStore, InMemoryRoomStore

# Group naming
ROOM_GROUP_PREFIX = "room_"
SYS_GROUP_PREFIX = "sys_"
SYS_ROOMS_GROUP = "sys_rooms"

def as_room_group(room_id: str) -> str:
    return f"{ROOM_GROUP_PREFIX}{room_id}"

def try_room_id_from_group(group_name: Optional[str]) -> Optional[str]:
    if isinstance(group_name, str) and group_name.startswith(ROOM_GROUP_PREFIX):
        return group_name[len(ROOM_GROUP_PREFIX):]
    return None

class ClientConnectionContext:
    def __init__(self, query: str, connection_id: str, *, user_id: Optional[str] = None, attrs: Optional[Dict[str, Any]] = None) -> None:
        self.query = query
        self.connectionId = connection_id
        self.user_id: Optional[str] = user_id
        self.attrs: Dict[str, Any] = attrs or {}

OnConnecting = Callable[[ClientConnectionContext, "ChatServiceBase"], Union[Awaitable[None], None]]
OnConnected = Callable[[ClientConnectionContext, "ChatServiceBase"], Union[Awaitable[None], None]]
OnDisconnected = Callable[[ClientConnectionContext, "ChatServiceBase"], Union[Awaitable[None], None]]
OnEventMessage = Callable[[ClientConnectionContext, str, Any, "ChatServiceBase"], Union[Awaitable[None], None]]
OnError = Callable[[ClientConnectionContext, BaseException, "ChatServiceBase"], Union[Awaitable[None], None]]

class ChatServiceBase:
    """Manages event handler lists and defines abstract transport contract."""
    def __init__(self, *, room_store: Optional[RoomStore] = None, logger: Optional[logging.Logger] = None) -> None:
        self.log = logger or logging.getLogger("chat_service")
        self.room_store = room_store or InMemoryRoomStore()
        self._on_connecting: List[OnConnecting] = []
        self._on_connected: List[OnConnected] = []
        self._on_disconnected: List[OnDisconnected] = []
        self._on_event_message: List[OnEventMessage] = []
        self._on_error: List[OnError] = []

    # Registration helpers
    def on(self, event: str, handler: Callable[..., Union[Awaitable[None], None]]) -> None:
        if event == "connecting":
            self._on_connecting.append(handler)
        elif event == "connected":
            self._on_connected.append(handler)
        elif event == "disconnected":
            self._on_disconnected.append(handler)
        elif event == "event_message":
            self._on_event_message.append(handler)
        elif event == "error":
            self._on_error.append(handler)
        else:
            raise ValueError(f"Unknown event: {event}")

    def on_connecting(self, handler: OnConnecting) -> None: self.on("connecting", handler)
    def on_connected(self, handler: OnConnected) -> None: self.on("connected", handler)
    def on_disconnected(self, handler: OnDisconnected) -> None: self.on("disconnected", handler)
    def on_event_message(self, handler: OnEventMessage) -> None: self.on("event_message", handler)
    def on_error(self, handler: OnError) -> None: self.on("error", handler)

    async def _emit(self, handlers: List[Callable[..., Union[Awaitable[None], None]]], *args: Any) -> None:
        for h in list(handlers):
            try:
                res = h(*args, self)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:  # noqa: BLE001
                self.log.exception("Callback error in %r", h)

    # Abstract transport contract
    async def start_chat(self, host: str = "0.0.0.0", port: int = 8765) -> None: raise NotImplementedError
    async def stop(self) -> None: raise NotImplementedError
    async def send_to_group(self, group: str, message: str, exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> Any: raise NotImplementedError
    async def streaming_to_group(self, group: str, chunks: AsyncIterator[str], exclude_ids: Optional[List[str]] = None, from_user_id: Optional[str] = None) -> str: raise NotImplementedError
    async def add_to_group(self, connection_id: str, group: str) -> None: raise NotImplementedError
    async def remove_from_group(self, connection_id: str, group: str) -> None: raise NotImplementedError
    async def notify_rooms_changed(self) -> None: raise NotImplementedError

__all__ = [
    "ChatServiceBase",
    "ClientConnectionContext",
    "as_room_group",
    "try_room_id_from_group",
    "SYS_ROOMS_GROUP",
]
