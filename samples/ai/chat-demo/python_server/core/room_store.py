from __future__ import annotations

import asyncio
import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

import logging
from datetime import datetime, timezone
import random
import string

DEFAULT_ROOM_ID = os.getenv("DEFAULT_ROOM_ID", "public")

try:
    from azure.data.tables import TableServiceClient, UpdateMode
    from azure.core.exceptions import ResourceNotFoundError
except Exception:  # noqa: BLE001
    TableServiceClient = None  # type: ignore[assignment]
    ResourceNotFoundError = Exception  # type: ignore[assignment]

try:
	from .credentials import get_azure_credential  # type: ignore
except Exception:  # noqa: BLE001
	def get_azure_credential(**_: object):  # type: ignore
		raise RuntimeError("Azure credential initilization failed.")

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
	def from_dict(cls, data: Dict[str, Any]) -> "RoomMetadata":  # pragma: no cover (currently unused)
		return cls(
			room_id=data["roomId"],
			room_name=data["roomName"],
			user_id=data["userId"],
			created_at=data.get("createdAt"),
			updated_at=data.get("updatedAt"),
			description=data.get("description"),
		)


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
	async def create_room_metadata(self, user_id: str, room_name: str, *, room_id: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata: ...
	@abstractmethod
	async def get_room_metadata(self, user_id: str, room_id: str) -> Optional[RoomMetadata]: ...
	@abstractmethod
	async def update_room_metadata(self, user_id: str, room_id: str, *, room_name: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata: ...
	@abstractmethod
	async def delete_room_metadata(self, user_id: str, room_id: str) -> bool: ...
	@abstractmethod
	async def list_user_rooms(self, user_id: str) -> List[RoomMetadata]: ...
	@abstractmethod
	async def room_exists(self, user_id: str, room_id: str) -> bool: ...

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

	async def register_room(self, room: str) -> None:
		if room not in self._room_messages:
			self._room_messages[room] = []

	async def record_room_event(self, room: str, event: Dict[str, Any]) -> None:
		await self.register_room(room)
		msgs = self._room_messages[room]
		msgs.append(event)
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

	# -------- metadata API implementations --------
	async def create_room_metadata(self, user_id: str, room_name: str, *, room_id: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:  # type: ignore[override]
		import uuid
		if user_id not in self._user_rooms:
			self._user_rooms[user_id] = {}
		if not room_id:
			room_id = f"room_{uuid.uuid4().hex[:8]}"
		# Idempotent semantics: if room exists just return existing instance (do not overwrite name/description)
		existing = self._user_rooms[user_id].get(room_id)
		if existing:
			return existing
		room = RoomMetadata(room_id=room_id, room_name=room_name, user_id=user_id, description=description)
		self._user_rooms[user_id][room_id] = room
		return room

	async def get_room_metadata(self, user_id: str, room_id: str) -> Optional[RoomMetadata]:  # type: ignore[override]
		if room_id == DEFAULT_ROOM_ID:
			return self._default_room
		return self._user_rooms.get(user_id, {}).get(room_id)

	async def update_room_metadata(self, user_id: str, room_id: str, *, room_name: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:  # type: ignore[override]
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

	async def delete_room_metadata(self, user_id: str, room_id: str) -> bool:  # type: ignore[override]
		if room_id == DEFAULT_ROOM_ID:
			return False
		rooms = self._user_rooms.get(user_id)
		if rooms and room_id in rooms:
			rooms.pop(room_id, None)
			return True
		return False

	async def list_user_rooms(self, user_id: str) -> List[RoomMetadata]:  # type: ignore[override]
		rooms: List[RoomMetadata] = [self._default_room]
		if user_id in self._user_rooms:
			rooms.extend(self._user_rooms[user_id].values())
		return rooms

	async def room_exists(self, user_id: str, room_id: str) -> bool:  # type: ignore[override]
		if room_id == DEFAULT_ROOM_ID:
			return True
		return room_id in self._user_rooms.get(user_id, {})

class AzureTableRoomStore(RoomStore):
	"""Room store backed by Azure Table Storage for scalable history.

	Table schema:
	  - Table name: CHAT_TABLE_NAME (default chatmessages)
	  - PartitionKey: room id
	  - RowKey: ISO8601 timestamp + '_' + random suffix (lexicographically sortable)
	  - Properties: messageId, type, fromUser, text, ts, meta (optional JSON string)
	"""

	def __init__(self, *, connection_string: Optional[str] = None, account_name: Optional[str] = None, table_name: Optional[str] = None, max_messages_per_room: int = 200, metadata_table_name: Optional[str] = None) -> None:
		if TableServiceClient is None:
			raise RuntimeError("azure-data-tables not installed. Please install azure-data-tables to use AzureTableRoomStore.")
		self._table_name = (table_name or os.getenv("CHAT_TABLE_NAME") or "chatmessages").strip().lower()
		self._conn_str = connection_string or os.getenv("AZURE_STORAGE_CONNECTION_STRING")
		self._account_name = (account_name or os.getenv("AZURE_STORAGE_ACCOUNT") or "").strip()
		self._max_messages = max_messages_per_room
		# Metadata table setup (separate table) reusing logic from former AzureTableRoomMetadataStore
		self._metadata_table_name = (metadata_table_name or os.getenv("ROOM_METADATA_TABLE_NAME") or "roommetadata").strip().lower()
		# Lazy in-memory cache for list_rooms (populated incrementally)
		self._known_rooms: set[str] = set([DEFAULT_ROOM_ID])
		try:
			if self._conn_str:
				self._svc = TableServiceClient.from_connection_string(self._conn_str)  # type: ignore[assignment]
			elif self._account_name:
				cred = get_azure_credential()
				table_url = f"https://{self._account_name}.table.core.windows.net"
				self._svc = TableServiceClient(endpoint=table_url, credential=cred)  # type: ignore[assignment]
			else:
				raise RuntimeError("Provide AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT for AzureTableRoomStore")
			self._table_client = self._svc.create_table_if_not_exists(self._table_name)
			self._metadata_client = self._svc.create_table_if_not_exists(self._metadata_table_name)
		except Exception:  # noqa: BLE001
			raise

	# --------------- helpers ---------------
	@staticmethod
	def _row_key() -> str:
		ts = datetime.now(timezone.utc).isoformat()
		rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
		return f"{ts}_{rand}"

	async def register_room(self, room: str) -> None:  # type: ignore[override]
		# No-op (rooms inferred). Add to cache.
		self._known_rooms.add(room)

	async def record_room_event(self, room: str, event: Dict[str, Any]) -> None:  # type: ignore[override]
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
			await asyncio.to_thread(self._table_client.upsert_entity, entity, mode=UpdateMode.MERGE)  # type: ignore[arg-type]
		except Exception:
			pass

	async def append_message(self, room: str, event: Dict[str, Any]) -> None:  # type: ignore[override]
		await self.record_room_event(room, event)

	async def get_room_messages(self, room: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:  # type: ignore[override]
		try:
			# Query all entities for the room; for large histories we could add paging.
			entities = list(self._table_client.query_entities(f"PartitionKey eq '{room}'"))  # type: ignore[call-arg]
			# Sort RowKey ascending then slice tail
			entities.sort(key=lambda e: e["RowKey"])  # oldest -> newest
			if limit is not None and limit >= 0:
				entities = entities[-limit:]
			# Map back to message list shape expected by existing API
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

	async def list_rooms(self) -> List[Dict[str, Any]]:  # type: ignore[override]
		# Best-effort enumeration: query a small sample of RowKeys per partition by scanning.
		try:
			# Table Storage does not have a direct DISTINCT partition query; we scan limited entities.
			# For simplicity, retrieve up to 1000 entities and accumulate partitions.
			rooms = set(self._known_rooms)
			count_by_room: Dict[str, int] = {r: 0 for r in rooms}
			for ent in self._table_client.list_entities(results_per_page=1000):  # type: ignore[call-arg]
				pk = ent.get("PartitionKey")
				if isinstance(pk, str):
					rooms.add(pk)
					count_by_room[pk] = count_by_room.get(pk, 0) + 1
			return [{"name": r, "messages": count_by_room.get(r, 0)} for r in sorted(rooms)]
		except Exception:
			return [{"name": r, "messages": 0} for r in sorted(self._known_rooms)]

	async def remove_room_if_empty(self, room: str) -> None:  # type: ignore[override]
		# Not implemented (removing all entities is expensive). Could be added if required.
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

	async def create_room_metadata(self, user_id: str, room_name: str, *, room_id: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:  # type: ignore[override]
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

	async def get_room_metadata(self, user_id: str, room_id: str) -> Optional[RoomMetadata]:  # type: ignore[override]
		if room_id == DEFAULT_ROOM_ID:
			return RoomMetadata(room_id=DEFAULT_ROOM_ID, room_name="Public Chat", user_id="system", description="Default public room")
		try:
			ent = await asyncio.to_thread(self._metadata_client.get_entity, partition_key=user_id, row_key=room_id)
			return self._metadata_from_entity(ent)
		except Exception:
			return None

	async def update_room_metadata(self, user_id: str, room_id: str, *, room_name: Optional[str] = None, description: Optional[str] = None) -> RoomMetadata:  # type: ignore[override]
		room = await self.get_room_metadata(user_id, room_id)
		if not room:
			raise ValueError(f"Room {room_id} not found for user {user_id}")
		if room_name:
			room.room_name = room_name
		if description is not None:
			room.description = description or ""
		from datetime import datetime, timezone
		room.updated_at = datetime.now(timezone.utc).isoformat()
		entity = self._metadata_to_entity(room)
		try:
			await asyncio.to_thread(self._metadata_client.update_entity, entity, mode=UpdateMode.REPLACE)  # type: ignore[arg-type]
			return room
		except Exception as e:  # noqa: BLE001
			raise ValueError(f"Failed to update room metadata: {e}")

	async def delete_room_metadata(self, user_id: str, room_id: str) -> bool:  # type: ignore[override]
		if room_id == DEFAULT_ROOM_ID:
			return False
		try:
			await asyncio.to_thread(self._metadata_client.delete_entity, partition_key=user_id, row_key=room_id)
			return True
		except Exception:
			return False

	async def list_user_rooms(self, user_id: str) -> List[RoomMetadata]:  # type: ignore[override]
		rooms: List[RoomMetadata] = [RoomMetadata(room_id=DEFAULT_ROOM_ID, room_name="Public Chat", user_id="system", description="Default public room")]
		try:
			ents = self._metadata_client.query_entities(f"PartitionKey eq '{user_id}'")  # type: ignore[call-arg]
			for ent in ents:
				rooms.append(self._metadata_from_entity(ent))
		except Exception:
			pass
		return rooms

	async def room_exists(self, user_id: str, room_id: str) -> bool:  # type: ignore[override]
		if room_id == DEFAULT_ROOM_ID:
			return True
		room = await self.get_room_metadata(user_id, room_id)
		return room is not None


# ------------------------------------------------------------------
# Builder helper
# ------------------------------------------------------------------
from .runtime_config import StorageMode  # moved up for type availability

def build_room_store(app_logger: logging.Logger, *, storage_mode: StorageMode = StorageMode.MEMORY) -> RoomStore:
	"""Create the RoomStore based on explicit StorageMode enum.
	"""
	from . import InMemoryRoomStore as _InMemoryRoomStore
	from . import AzureTableRoomStore as _AzureTableRoomStore  # type: ignore
	from os import getenv
	if not isinstance(storage_mode, StorageMode):  # defensive type check
		raise RuntimeError("storage_mode must be a StorageMode enum instance")

	if storage_mode is StorageMode.MEMORY:
		return _InMemoryRoomStore()

	# Table mode
	az_conn = getenv("AZURE_STORAGE_CONNECTION_STRING")
	acct = getenv("AZURE_STORAGE_ACCOUNT")
	if _AzureTableRoomStore is None:
		raise RuntimeError("STORAGE_MODE=table but azure-data-tables dependency not installed")
	if not (az_conn or acct):
		raise RuntimeError("STORAGE_MODE=table requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT")
	store = _AzureTableRoomStore(connection_string=az_conn) if az_conn else _AzureTableRoomStore(account_name=acct)
	app_logger.info("RoomStore: TABLE (%s)", "conn_str" if az_conn else "account")
	return store

__all__ = [
	"RoomStore",
	"InMemoryRoomStore",
	"AzureTableRoomStore",
	"RoomMetadata",
	"build_room_store",
]
