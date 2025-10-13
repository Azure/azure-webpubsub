from __future__ import annotations

import asyncio
import os
import random
import string
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .base import RoomStore
from .models import RoomMetadata
from ...config import DEFAULT_ROOM_ID

# Optional azure-data-tables import (lazy, best-effort)
import importlib

_tables_client_cls: Any | None = None
_update_mode_enum: Any | None = None
_resource_not_found_exc: Any = Exception
_HAS_TABLES = False
try:  # pragma: no cover
    _tables_mod = importlib.import_module("azure.data.tables")
    _core_exc_mod = importlib.import_module("azure.core.exceptions")
    _tables_client_cls = getattr(_tables_mod, "TableServiceClient", None)
    _update_mode_enum = getattr(_tables_mod, "UpdateMode", None)
    _resource_not_found_exc = getattr(_core_exc_mod, "ResourceNotFoundError", Exception)
    _HAS_TABLES = _tables_client_cls is not None
except Exception:  # noqa: BLE001
    pass

try:  # optional dependency
    from ..credentials import get_azure_credential
except Exception:  # noqa: BLE001
    def get_azure_credential() -> Any:  # type: ignore[override]
        raise RuntimeError("Azure credential initialization failed.")


class AzureTableRoomStore(RoomStore):
    """Room store backed by Azure Table Storage for scalable history.

    Table schema:
      - Table name: CHAT_TABLE_NAME (default chatmessages)
      - PartitionKey: room id
      - RowKey: ISO8601 timestamp + '_' + random suffix (lexicographically sortable)
      - Properties: messageId, type, fromUser, text, ts, meta (optional JSON string)
    """

    def __init__(self, *, connection_string: Optional[str] = None, account_name: Optional[str] = None, table_name: Optional[str] = None, max_messages_per_room: int = 200, metadata_table_name: Optional[str] = None) -> None:
        if _tables_client_cls is None:
            raise RuntimeError("azure-data-tables not installed. Please install azure-data-tables to use AzureTableRoomStore.")
        self._table_name = (table_name or os.getenv("CHAT_TABLE_NAME") or "chatmessages").strip().lower()
        self._conn_str = connection_string or os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self._account_name = (account_name or os.getenv("AZURE_STORAGE_ACCOUNT") or "").strip()
        self._max_messages = max_messages_per_room
        # Metadata table name
        self._metadata_table_name = (metadata_table_name or os.getenv("ROOM_METADATA_TABLE_NAME") or "roommetadata").strip().lower()
        # Lazy cache for list_rooms
        self._known_rooms: set[str] = set([DEFAULT_ROOM_ID])
        if self._conn_str:
            self._svc = _tables_client_cls.from_connection_string(self._conn_str)
        elif self._account_name:
            cred = get_azure_credential()
            table_url = f"https://{self._account_name}.table.core.windows.net"
            self._svc = _tables_client_cls(endpoint=table_url, credential=cred)
        else:
            raise RuntimeError("Provide AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT for AzureTableRoomStore")
        self._table_client = self._svc.create_table_if_not_exists(self._table_name)
        self._metadata_client = self._svc.create_table_if_not_exists(self._metadata_table_name)

    # --------------- helpers ---------------
    @staticmethod
    def _row_key() -> str:
        ts = datetime.now(timezone.utc).isoformat()
        rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"{ts}_{rand}"

    async def register_room(self, room: str) -> None:  # pragma: no cover (no-op)
        self._known_rooms.add(room)

    async def record_room_event(self, room: str, event: Dict[str, Any]) -> None:
        await self.register_room(room)
        entity = {
            "PartitionKey": room,
            "RowKey": self._row_key(),
            "messageId": event.get("messageId"),
            "type": event.get("type"),
            "fromUser": event.get("from"),
            "text": event.get("message"),
            "ts": event.get("timestamp"),
        }
        try:
            merge_mode = getattr(_update_mode_enum, "MERGE", None)
            if merge_mode is None:
                await asyncio.to_thread(self._table_client.upsert_entity, entity)
            else:
                await asyncio.to_thread(self._table_client.upsert_entity, entity, mode=merge_mode)
        except Exception:
            pass

    async def append_message(self, room: str, event: Dict[str, Any]) -> None:
        await self.record_room_event(room, event)

    async def get_room_messages(self, room: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            entities = list(self._table_client.query_entities(f"PartitionKey eq '{room}'"))
            entities.sort(key=lambda e: e["RowKey"])  # oldest -> newest
            if limit is not None and limit >= 0:
                entities = entities[-limit:]
            msgs: List[Dict[str, Any]] = []
            for ent in entities:
                msgs.append({
                    "messageId": ent.get("messageId"),
                    "type": ent.get("type"),
                    "from": ent.get("fromUser"),
                    "message": ent.get("text"),
                    "timestamp": ent.get("ts"),
                })
            return msgs
        except Exception:
            return []

    async def list_rooms(self) -> List[Dict[str, Any]]:
        try:
            rooms = set(self._known_rooms)
            count_by_room: Dict[str, int] = {r: 0 for r in rooms}
            for ent in self._table_client.list_entities(results_per_page=1000):
                pk = ent.get("PartitionKey")
                if isinstance(pk, str):
                    rooms.add(pk)
                    count_by_room[pk] = count_by_room.get(pk, 0) + 1
            return [{"name": r, "messages": count_by_room.get(r, 0)} for r in sorted(rooms)]
        except Exception:
            return [{"name": r, "messages": 0} for r in sorted(self._known_rooms)]

    async def remove_room_if_empty(self, room: str) -> None:  # pragma: no cover
        return

    # -------- metadata API (Azure Table) --------
    def _metadata_to_entity(self, rm: RoomMetadata) -> Dict[str, Any]:
        return {
            "PartitionKey": rm.user_id,
            "RowKey": rm.room_id,
            "roomName": rm.room_name,
            "description": rm.description,
            "createdAt": rm.created_at,
            "updatedAt": rm.updated_at,
        }

    def _metadata_from_entity(self, ent: Dict[str, Any]) -> RoomMetadata:
        return RoomMetadata(
            room_id=ent["RowKey"],
            room_name=ent.get("roomName", ent["RowKey"]),
            user_id=ent["PartitionKey"],
            description=ent.get("description", ""),
            created_at=ent.get("createdAt"),
            updated_at=ent.get("updatedAt"),
        )

    async def create_room_metadata(self, user_id: str, room_name: str, *, room_id: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:
        import uuid

        if not room_id:
            room_id = f"room_{uuid.uuid4().hex[:8]}"
        room = RoomMetadata(room_id=room_id, room_name=room_name, user_id=user_id, description=description)
        entity = self._metadata_to_entity(room)
        try:
            await asyncio.to_thread(self._metadata_client.create_entity, entity)
            return room
        except Exception as e:  # noqa: BLE001
            raise ValueError(f"Failed to create room metadata: {e}")

    async def get_room_metadata(self, user_id: str, room_id: str) -> Optional[RoomMetadata]:
        if room_id == DEFAULT_ROOM_ID:
            return RoomMetadata(room_id=DEFAULT_ROOM_ID, room_name="Public Chat", user_id="system", description="Default public room")
        try:
            ent = await asyncio.to_thread(self._metadata_client.get_entity, partition_key=user_id, row_key=room_id)
            return self._metadata_from_entity(ent)
        except Exception:
            return None

    async def update_room_metadata(self, user_id: str, room_id: str, *, room_name: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:
        room = await self.get_room_metadata(user_id, room_id)
        if not room:
            raise ValueError(f"Room {room_id} not found for user {user_id}")
        if room_name:
            room.room_name = room_name
        if description is not None:
            room.description = description or ""
        room.updated_at = datetime.now(timezone.utc).isoformat()
        entity = self._metadata_to_entity(room)
        try:
            replace_mode = getattr(_update_mode_enum, "REPLACE", None)
            if replace_mode is None:
                await asyncio.to_thread(self._metadata_client.update_entity, entity)
            else:
                await asyncio.to_thread(self._metadata_client.update_entity, entity, mode=replace_mode)
            return room
        except Exception as e:  # noqa: BLE001
            raise ValueError(f"Failed to update room metadata: {e}")

    async def delete_room_metadata(self, user_id: str, room_id: str) -> bool:
        if room_id == DEFAULT_ROOM_ID:
            return False
        try:
            await asyncio.to_thread(self._metadata_client.delete_entity, partition_key=user_id, row_key=room_id)
            return True
        except Exception:
            return False

    async def list_user_rooms(self, user_id: str) -> List[RoomMetadata]:
        rooms: List[RoomMetadata] = [RoomMetadata(room_id=DEFAULT_ROOM_ID, room_name="Public Chat", user_id="system", description="Default public room")]
        try:
            ents = self._metadata_client.query_entities(f"PartitionKey eq '{user_id}'")
            for ent in ents:
                rooms.append(self._metadata_from_entity(ent))
        except Exception:
            pass
        return rooms

    async def room_exists(self, user_id: str, room_id: str) -> bool:
        if room_id == DEFAULT_ROOM_ID:
            return True
        room = await self.get_room_metadata(user_id, room_id)
        return room is not None


__all__ = ["AzureTableRoomStore"]
