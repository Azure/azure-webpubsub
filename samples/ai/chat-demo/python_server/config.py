from __future__ import annotations

import os

# Centralized app-wide defaults and config constants

# Default public room id; can be overridden via env
DEFAULT_ROOM_ID: str = os.getenv("DEFAULT_ROOM_ID", "public")

__all__ = ["DEFAULT_ROOM_ID"]

