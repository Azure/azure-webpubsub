"""Backward compatibility shim for refactored chat services.

All implementation lives in the top-level ``chat_service`` package. This file
only re-exports symbols that existing imports from ``core.chat_service`` may
still reference. New code should import directly from ``chat_service`` or
``chat_service.factory``.
"""
from __future__ import annotations

from ..chat_service.base import (
    ChatServiceBase,
    ClientConnectionContext,
    as_room_group,
    try_room_id_from_group,
    SYS_ROOMS_GROUP,
)
from ..chat_service.self_host_chat_service import ChatService, SendResult

from ..chat_service.factory import build_chat_service, resolve_webpubsub_config

__all__ = [
    "ChatService",
    "ChatServiceBase",
    "ClientConnectionContext",
    "SendResult",
    "as_room_group",
    "try_room_id_from_group",
    "SYS_ROOMS_GROUP",
    "build_chat_service",
    "resolve_webpubsub_config",
]

# NOTE: This shim is slated for removal once all imports updated to python_server.chat_service.* directly.
