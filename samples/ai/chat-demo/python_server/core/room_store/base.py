from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class RoomStore(ABC):
    # -------- message history API (existing) --------
    @abstractmethod
    async def register_room(self, room: str) -> None: ...

    @abstractmethod
    async def record_room_event(self, room: str, event: Dict[str, Any]) -> None: ...

    @abstractmethod
    async def append_message(self, room: str, event: Dict[str, Any]) -> None: ...

    @abstractmethod
    async def get_room_messages(self, room: str, limit: Optional[int] = None) -> List[Dict[str, Any]]: ...

    @abstractmethod
    async def list_rooms(self) -> List[Dict[str, Any]]: ...

    @abstractmethod
    async def remove_room_if_empty(self, room: str) -> None: ...

    # -------- metadata API (new, merged) --------
    @abstractmethod
    async def create_room_metadata(self, user_id: str, room_name: str, *, room_id: Optional[str] = None, description: Optional[str] = None) -> "RoomMetadata": ...

    @abstractmethod
    async def get_room_metadata(self, user_id: str, room_id: str) -> Optional["RoomMetadata"]: ...

    @abstractmethod
    async def update_room_metadata(self, user_id: str, room_id: str, *, room_name: Optional[str] = None, description: Optional[str] = None) -> "RoomMetadata": ...

    @abstractmethod
    async def delete_room_metadata(self, user_id: str, room_id: str) -> bool: ...

    @abstractmethod
    async def list_user_rooms(self, user_id: str) -> List["RoomMetadata"]: ...

    @abstractmethod
    async def room_exists(self, user_id: str, room_id: str) -> bool: ...


__all__ = ["RoomStore"]

