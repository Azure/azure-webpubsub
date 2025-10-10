from __future__ import annotations

from typing import Any, Dict, List, Optional

from .base import RoomStore
from .models import RoomMetadata
from ...config import DEFAULT_ROOM_ID


class InMemoryRoomStore(RoomStore):
    def __init__(self, *, max_messages: int = 200) -> None:
        # message history
        self._room_messages: Dict[str, List[Dict[str, Any]]] = {}
        self._max_room_messages = max_messages
        self._room_messages.setdefault(DEFAULT_ROOM_ID, [])
        # metadata storage: { user_id: { room_id: RoomMetadata } }
        self._user_rooms: Dict[str, Dict[str, RoomMetadata]] = {}
        self._default_room = RoomMetadata(
            room_id=DEFAULT_ROOM_ID,
            room_name="Public Chat",
            user_id="system",
            description="Default public room",
        )

    # -------- history API --------
    async def register_room(self, room: str) -> None:
        # backwards compat: ensure room appears in list_rooms even without messages
        self._room_messages.setdefault(room, [])

    async def record_room_event(self, room: str, event: Dict[str, Any]) -> None:
        self._room_messages.setdefault(room, []).append(event)
        msgs = self._room_messages[room]
        if len(msgs) > self._max_room_messages:
            overflow = len(msgs) - self._max_room_messages
            del msgs[:overflow]

    async def append_message(self, room: str, event: Dict[str, Any]) -> None:
        await self.record_room_event(room, event)

    async def get_room_messages(self, room: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        msgs = list(self._room_messages.get(room, []))
        if limit is not None and limit >= 0:
            return msgs[-limit:]
        return msgs

    async def list_rooms(self) -> List[Dict[str, Any]]:
        names = [name for name in self._room_messages.keys()]
        return [{"name": name, "messages": len(self._room_messages.get(name, []))} for name in names]

    async def remove_room_if_empty(self, room: str) -> None:
        if room == DEFAULT_ROOM_ID:
            return
        msgs = self._room_messages.get(room)
        if msgs is not None and len(msgs) == 0:
            self._room_messages.pop(room, None)

    # -------- metadata API --------
    async def create_room_metadata(self, user_id: str, room_name: str, *, room_id: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:
        import uuid

        if user_id not in self._user_rooms:
            self._user_rooms[user_id] = {}
        if not room_id:
            room_id = f"room_{uuid.uuid4().hex[:8]}"
        # Idempotent: return existing
        existing = self._user_rooms[user_id].get(room_id)
        if existing:
            return existing
        room = RoomMetadata(room_id=room_id, room_name=room_name, user_id=user_id, description=description)
        self._user_rooms[user_id][room_id] = room
        return room

    async def get_room_metadata(self, user_id: str, room_id: str) -> Optional[RoomMetadata]:
        if room_id == DEFAULT_ROOM_ID:
            return self._default_room
        return self._user_rooms.get(user_id, {}).get(room_id)

    async def update_room_metadata(self, user_id: str, room_id: str, *, room_name: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:
        room = await self.get_room_metadata(user_id, room_id)
        if not room:
            raise ValueError(f"Room {room_id} not found for user {user_id}")
        if room_name:
            room.room_name = room_name
        if description is not None:
            room.description = description or ""
        from datetime import datetime, timezone

        room.updated_at = datetime.now(timezone.utc).isoformat()
        return room

    async def delete_room_metadata(self, user_id: str, room_id: str) -> bool:
        if room_id == DEFAULT_ROOM_ID:
            return False
        rooms = self._user_rooms.get(user_id)
        if rooms and room_id in rooms:
            rooms.pop(room_id, None)
            return True
        return False

    async def list_user_rooms(self, user_id: str) -> List[RoomMetadata]:
        rooms: List[RoomMetadata] = [self._default_room]
        if user_id in self._user_rooms:
            rooms.extend(self._user_rooms[user_id].values())
        return rooms

    async def room_exists(self, user_id: str, room_id: str) -> bool:
        if room_id == DEFAULT_ROOM_ID:
            return True
        return room_id in self._user_rooms.get(user_id, {})


__all__ = ["InMemoryRoomStore"]
