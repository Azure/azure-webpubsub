from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from typing import List

class TransportMode(str, Enum):
    SELF = "self"
    WEBPUBSUB = "webpubsub"

class StorageMode(str, Enum):
    MEMORY = "memory"
    TABLE = "table"

@dataclass
class RuntimeConfig:
    transport: TransportMode
    storage: StorageMode

TRUTHY = {"1", "true", "yes", "on"}


def _get_env(name: str) -> str | None:
    v = os.getenv(name)
    return v.strip() if isinstance(v, str) and v.strip() else None


def resolve_runtime_config() -> RuntimeConfig:
    # Transport resolution
    raw_transport = (_get_env("TRANSPORT_MODE") or "self").lower()
    if raw_transport not in (t.value for t in TransportMode):
        raise RuntimeError(f"Invalid TRANSPORT_MODE={raw_transport}")
    transport = TransportMode(raw_transport)  # type: ignore[arg-type]

    # Storage resolution
    raw_storage = (_get_env("STORAGE_MODE") or "memory").lower()
    if raw_storage not in (s.value for s in StorageMode):
        raise RuntimeError(f"Invalid STORAGE_MODE={raw_storage}")
    storage = StorageMode(raw_storage)  # type: ignore[arg-type]

    # Validate dependencies strictly
    if transport == TransportMode.WEBPUBSUB:
        if not (_get_env("WEBPUBSUB_ENDPOINT") or _get_env("WEBPUBSUB_CONNECTION_STRING")):
            raise RuntimeError("TRANSPORT_MODE=webpubsub requires WEBPUBSUB_ENDPOINT or WEBPUBSUB_CONNECTION_STRING")
    if storage == StorageMode.TABLE:
        if not (_get_env("AZURE_STORAGE_CONNECTION_STRING") or _get_env("AZURE_STORAGE_ACCOUNT")):
            raise RuntimeError("STORAGE_MODE=table requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT")
    return RuntimeConfig(transport=transport, storage=storage)

__all__ = [
    "TransportMode",
    "StorageMode",
    "RuntimeConfig",
    "resolve_runtime_config",
]
