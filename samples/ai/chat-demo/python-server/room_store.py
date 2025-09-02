from __future__ import annotations

import asyncio
import json
import os
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any, Dict, List, Optional

DEFAULT_ROOM_ID = os.getenv("DEFAULT_ROOM_ID", "public")

# Optional Azure Blob Storage support for persistence
try:
    from azure.storage.blob import BlobServiceClient
    from azure.core.exceptions import ResourceNotFoundError, ResourceExistsError
except Exception:  # noqa: BLE001
    BlobServiceClient = None  # type: ignore[assignment]
    ResourceNotFoundError = Exception  # type: ignore[assignment]
    ResourceExistsError = Exception  # type: ignore[assignment]


class RoomStore(ABC):
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


class InMemoryRoomStore(RoomStore):
    def __init__(self, *, max_messages: int = 200) -> None:
        self._room_messages: Dict[str, List[Dict[str, Any]]] = {}
        self._max_room_messages = max_messages
        # Seed default room and keep it first (insertion order)
        self._room_messages.setdefault(DEFAULT_ROOM_ID, [])

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


class LocalRoomStore(InMemoryRoomStore):
    def __init__(self, *, file_path: str = "./chat_state.json", max_messages: int = 200) -> None:
        super().__init__(max_messages=max_messages)
        self._file_path = file_path
        self._load_state()

    def _load_state(self) -> None:
        try:
            if not os.path.exists(self._file_path):
                return
            with open(self._file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            room_messages = data.get("room_messages", {})
            # Filter out meta groups
            room_messages = {k: v for k, v in room_messages.items()}
            self._room_messages = {k: list(v) for k, v in room_messages.items()}
            # Ensure default room first (insertion order)
            if DEFAULT_ROOM_ID not in self._room_messages:
                self._room_messages = {DEFAULT_ROOM_ID: [], **self._room_messages}
            else:
                # Rebuild dict to move default to front
                items = [(k, self._room_messages[k]) for k in self._room_messages.keys() if k != DEFAULT_ROOM_ID]
                self._room_messages = {DEFAULT_ROOM_ID: self._room_messages[DEFAULT_ROOM_ID], **dict(items)}
        except Exception:
            # best-effort load
            pass

    async def _persist(self) -> None:
        try:
            dir_name = os.path.dirname(self._file_path)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            payload = {
                "room_messages": {k: v for k, v in self._room_messages.items()},
            }
            tmp = self._file_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False)
            os.replace(tmp, self._file_path)
        except Exception:
            pass

    async def register_room(self, room: str) -> None:  # type: ignore[override]
        await super().register_room(room)
        await self._persist()

    async def record_room_event(self, room: str, event: Dict[str, Any]) -> None:  # type: ignore[override]
        await super().record_room_event(room, event)
        await self._persist()

    async def remove_room_if_empty(self, room: str) -> None:  # type: ignore[override]
        await super().remove_room_if_empty(room)
        await self._persist()


class AzureRoomStore(InMemoryRoomStore):
    def __init__(self, *, connection_string: Optional[str] = None, container_name: Optional[str] = None, blob_name: Optional[str] = None, max_messages: int = 200) -> None:
        super().__init__(max_messages=max_messages)
        if BlobServiceClient is None:
            raise RuntimeError("azure-storage-blob is not installed. Please install azure-storage-blob to use AzureRoomStore.")
        self._conn_str = connection_string or os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        if not self._conn_str:
            raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not set for AzureRoomStore")
        self._container_name = (container_name or os.getenv("CHAT_STORAGE_CONTAINER") or "chatdemo").strip()
        self._blob_name = (blob_name or os.getenv("CHAT_STORAGE_BLOB") or "state.json").strip()
        try:
            self._blob_service: BlobServiceClient = BlobServiceClient.from_connection_string(self._conn_str)  # type: ignore[assignment]
            self._container = self._blob_service.get_container_client(self._container_name)
            try:
                self._container.create_container()
            except ResourceExistsError:
                pass
            self._blob = self._container.get_blob_client(self._blob_name)
        except Exception as e:  # noqa: BLE001
            raise
        self._load_state()

    def _load_state(self) -> None:
        try:
            downloader = self._blob.download_blob()
            raw = downloader.readall()
            data = json.loads(raw.decode("utf-8")) if isinstance(raw, (bytes, bytearray)) else json.loads(raw)
            room_messages = data.get("room_messages", {})
            room_messages = {k: v for k, v in room_messages.items()}
            self._room_messages = {k: list(v) for k, v in room_messages.items()}
            if DEFAULT_ROOM_ID not in self._room_messages:
                self._room_messages = {DEFAULT_ROOM_ID: [], **self._room_messages}
            else:
                items = [(k, self._room_messages[k]) for k in self._room_messages.keys() if k != DEFAULT_ROOM_ID]
                self._room_messages = {DEFAULT_ROOM_ID: self._room_messages[DEFAULT_ROOM_ID], **dict(items)}
        except ResourceNotFoundError:
            # ok, start empty
            pass
        except Exception:
            pass

    async def _persist(self) -> None:
        try:
            payload = {
                "room_messages": {k: v for k, v in self._room_messages.items()},
            }
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            await asyncio.to_thread(self._blob.upload_blob, data, overwrite=True)
        except Exception:
            pass

    async def register_room(self, room: str) -> None:  # type: ignore[override]
        await super().register_room(room)
        await self._persist()

    async def record_room_event(self, room: str, event: Dict[str, Any]) -> None:  # type: ignore[override]
        await super().record_room_event(room, event)
        await self._persist()

    async def remove_room_if_empty(self, room: str) -> None:  # type: ignore[override]
        await super().remove_room_if_empty(room)
        await self._persist()
