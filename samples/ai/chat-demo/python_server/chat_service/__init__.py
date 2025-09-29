"""Chat service package public surface

Exposes:
 - ChatServiceBase, ChatService (self-host)
 - Lazy placeholder for WebPubSubChatService (imported only when needed)
 - Helper group name utilities.
"""

from .base import (  # noqa: F401
    ChatServiceBase,
    ClientConnectionContext,
    as_room_group,
    try_room_id_from_group,
    SYS_ROOMS_GROUP,
)
from .self_host_chat_service import ChatService  # noqa: F401

try:  # Lazy optional import (will fail if azure webpubsub libs not installed)
    from .webpubsub_chat_service import WebPubSubChatService  # noqa: F401
except Exception:  # pragma: no cover
    WebPubSubChatService = None  # type: ignore

__all__ = [
    "ChatServiceBase",
    "ClientConnectionContext",
    "ChatService",
    "WebPubSubChatService",
    "as_room_group",
    "try_room_id_from_group",
    "SYS_ROOMS_GROUP",
]
