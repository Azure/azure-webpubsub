"""Centralized Azure credential selection.

Preference order:
 1. ManagedIdentityCredential if USE_MANAGED_IDENTITY=true and available
 2. DefaultAzureCredential

Falls back gracefully if azure-identity not installed.
"""
from __future__ import annotations

import os
import logging
from typing import Any

try:  # noqa: SIM105
    from azure.identity import DefaultAzureCredential  # type: ignore
except Exception:  # noqa: BLE001
    DefaultAzureCredential = None  # type: ignore[assignment]

try:  # Managed identity may be in same package but import separately for clarity
    from azure.identity import ManagedIdentityCredential  # type: ignore
except Exception:  # noqa: BLE001
    ManagedIdentityCredential = None  # type: ignore[assignment]

_LOG = logging.getLogger("azure_credentials")

def get_azure_credential() -> Any:
    """Return an Azure credential instance based on environment flag USE_MANAGED_IDENTITY.

    """
    if DefaultAzureCredential is None:
        raise RuntimeError("azure-identity not installed; cannot construct credential")

    use_mi_flag = os.getenv("USE_MANAGED_IDENTITY", "false").lower() in ("1","true","yes","on")
    if use_mi_flag:
        if ManagedIdentityCredential is not None:
            try:
                cred = ManagedIdentityCredential()
                _LOG.info("Using ManagedIdentityCredential")
                return cred
            except Exception as e:  # noqa: BLE001
                _LOG.warning("ManagedIdentityCredential failed (%s); falling back to DefaultAzureCredential", e)
        else:
            _LOG.debug("ManagedIdentityCredential not available; falling back")

    _LOG.info("Using DefaultAzureCredential")
    return DefaultAzureCredential()

__all__ = ["get_azure_credential"]
