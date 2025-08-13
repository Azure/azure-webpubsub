"""Core chat server components.

Re-exports for convenience so callers can simply do:
    from core import ChatService, WebPubSubChatService, chat_stream
"""
from .chat_service import (
    ChatService,
    WebPubSubChatService,
    ChatServiceBase,
    ClientConnectionContext,
    build_chat_service,
    as_room_group,
    SYS_ROOMS_GROUP,
)
from .chat_model_client import (
    OpenAIChatClient,
    chat_stream,
    get_openai_chat_client,
    get_chat_model,
)
from .room_store import (
    RoomStore,
    InMemoryRoomStore,
    build_room_store
)
from .utils import (
    generate_id,
    to_async_iterator,
    get_room_id
)
try:  # optional Azure export
    from .room_store import AzureTableRoomStore  # type: ignore
except Exception:  # noqa: BLE001
    AzureTableRoomStore = None  # type: ignore

__all__ = [
    "ChatService",
    "WebPubSubChatService",
    "ChatServiceBase",
    "ClientConnectionContext",
    "as_room_group",
    "SYS_ROOMS_GROUP",
    "OpenAIChatClient",
    "chat_stream",
    "get_openai_chat_client",
    "get_chat_model",
    "RoomStore",
    "InMemoryRoomStore",
    "AzureTableRoomStore",
    "build_chat_service",
    "build_room_store",
    "generate_id",
    "to_async_iterator",
    "get_room_id"
]
