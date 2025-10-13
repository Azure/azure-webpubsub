from __future__ import annotations

from typing import Any, Dict, Optional


class RoomMetadata:
    """Room metadata model (merged from former room_metadata_store)."""

    def __init__(
        self,
        room_id: str,
        room_name: str,
        user_id: str,
        *,
        created_at: Optional[str] = None,
        updated_at: Optional[str] = None,
        description: Optional[str] = None,
    ) -> None:
        from datetime import datetime, timezone

        self.room_id = room_id
        self.room_name = room_name
        self.user_id = user_id
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()
        self.updated_at = updated_at or self.created_at
        self.description = description or ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "roomId": self.room_id,
            "roomName": self.room_name,
            "userId": self.user_id,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RoomMetadata":  # pragma: no cover
        return cls(
            room_id=data["roomId"],
            room_name=data["roomName"],
            user_id=data["userId"],
            created_at=data.get("createdAt"),
            updated_at=data.get("updatedAt"),
            description=data.get("description"),
        )


__all__ = ["RoomMetadata"]

