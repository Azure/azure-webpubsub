from typing import Dict, Optional

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Dict, Set, List, Optional
from utils import generate_id

class ClientConnectionContext:
    def __init__(self, websocket, path, connectionId):
        self.websocket = websocket
        self.path = path
        self.connectionId = connectionId
    async def send_message(self, message):
        await self.websocket.send(message)

# Chat manager contains client manager, room manager, and chat history manager
class InMemoryChatManager:
    def __init__(self):
        self.messages = []
        self._clients: Dict[str, ClientConnectionContext] = {}
        self._groups: Dict[str, Set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    # --------------- client ops ---------------
    async def create_client(self, websocket: Any, path: str) -> ClientConnectionContext:
        connection_id = generate_id('conn-')

        context = ClientConnectionContext(websocket, path, connection_id)
        async with self._lock:
            self._clients[connection_id] = context
        return context

    async def remove_client(self, connection_id: str) -> None:
        async with self._lock:
            self._clients.pop(connection_id, None)
            for members in self._groups.values():
                members.discard(connection_id)

    async def get_client(self, connection_id: str) -> ClientConnectionContext | None:
        async with self._lock:
            return self._clients.get(connection_id)

    # --------------- group ops ---------------
    async def add_client_to_group(self, connection_id: str, group_name: str) -> None:
        async with self._lock:
            self._groups[group_name].add(connection_id)

    async def remove_client_from_group(self, connection_id: str, group_name: str) -> None:
        async with self._lock:
            if group_name in self._groups:
                self._groups[group_name].discard(connection_id)
                if not self._groups[group_name]:
                    self._groups.pop(group_name, None)

    async def groups_for_client(self, connection_id: str) -> Set[str]:
        async with self._lock:
            return {g for g, members in self._groups.items() if connection_id in members}

    # --------------- messaging ---------------
    @staticmethod
    async def _safe_send(client: Any, message: Any) -> None:
        try:
            send = getattr(client, "send_message", None)
            if not callable(send):
                return
            await send(message)
        except Exception:
            # Replace with logging if needed.
            return
        
    async def send_to_group(self, group_name: str, message: Any) -> List[asyncio.Task]:
        """Send to a group using snapshots (don’t hold the lock during awaits)."""
        async with self._lock:
            member_ids = set(self._groups.get(group_name, set()))
            clients_snapshot = dict(self._clients)
        tasks: List[asyncio.Task] = []
        for cid in member_ids:
            client = clients_snapshot.get(cid)
            if client is not None:
                tasks.append(asyncio.create_task(self._safe_send(client, message)))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        return tasks

    async def broadcast(self, message: Any) -> List[asyncio.Task]:
        async with self._lock:
            clients_snapshot = list(self._clients.values())
        tasks = [asyncio.create_task(self._safe_send(c, message)) for c in clients_snapshot]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        return tasks
    def add_message(self, room, user, content):
        self.messages.append({
            "room": room,
            "user": user,
            "content": content
        })
    def get_messages(self, room, limit=50):
        return [msg for msg in self.messages if msg["room"] == room][-limit:]
    def clear_messages(self, room):
        self.messages = [msg for msg in self.messages if msg["room"] != room]

def get_chat_service_instance() -> InMemoryChatManager:
    """Get a singleton ChatService instance"""
    global _chat_service_instance
    if _chat_service_instance is None:
        _chat_service_instance = InMemoryChatManager()
    return _chat_service_instance

chat_manager = InMemoryChatManager()

# Optional: tiny accessor & setter for tests/frameworks that want indirection
_service_ref: Optional[InMemoryChatManager] = chat_manager

def get_chat_manager() -> InMemoryChatManager:
    assert _service_ref is not None, "Chat manager not initialized"
    return _service_ref

def set_chat_manager(new_mgr: InMemoryChatManager) -> None:
    global _service_ref
    _service_ref = new_mgr
