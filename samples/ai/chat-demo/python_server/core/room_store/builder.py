from __future__ import annotations

import logging
from os import getenv

from .base import RoomStore
from .memory import InMemoryRoomStore
try:
    from .azure_table import AzureTableRoomStore
except Exception:  # pragma: no cover
    AzureTableRoomStore = None  # type: ignore

from ..runtime_config import StorageMode


def build_room_store(app_logger: logging.Logger, *, storage_mode: StorageMode = StorageMode.MEMORY) -> RoomStore:
    """Create the RoomStore based on explicit StorageMode enum."""
    if not isinstance(storage_mode, StorageMode):
        raise RuntimeError("storage_mode must be a StorageMode enum instance")

    if storage_mode is StorageMode.MEMORY:
        return InMemoryRoomStore()

    # Table mode
    az_conn = getenv("AZURE_STORAGE_CONNECTION_STRING")
    acct = getenv("AZURE_STORAGE_ACCOUNT")
    if AzureTableRoomStore is None:
        raise RuntimeError("STORAGE_MODE=table but azure-data-tables dependency not installed")
    if not (az_conn or acct):
        raise RuntimeError("STORAGE_MODE=table requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT")
    store = AzureTableRoomStore(connection_string=az_conn) if az_conn else AzureTableRoomStore(account_name=acct)
    app_logger.info("RoomStore: TABLE (%s)", "conn_str" if az_conn else "account")
    return store


__all__ = ["build_room_store"]
