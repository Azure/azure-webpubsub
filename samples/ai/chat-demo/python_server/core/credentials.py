"""Centralized Azure credential selection.

Preference order:
 1. ManagedIdentityCredential if USE_MANAGED_IDENTITY=true and available
 2. DefaultAzureCredential

Falls back gracefully if azure-identity not installed.
"""
from __future__ import annotations

import os
import logging
from typing import Any, Protocol, runtime_checkable, Optional

try:  # Import lazily; treat absence as optional dependency
    from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
except Exception:  # noqa: BLE001
    DefaultAzureCredential = None  # type: ignore
    ManagedIdentityCredential = None  # type: ignore

_LOG = logging.getLogger("azure_credentials")

@runtime_checkable
class _SupportsGetToken(Protocol):  # minimal protocol so callers can type narrow if desired
    def get_token(self, *scopes: str) -> Any:  # pragma: no cover - azure sdk provided
        ...  # noqa: D401, PIE790

CredentialType = Any  # Simplify: could be Union[DefaultAzureCredential, ManagedIdentityCredential]

def get_azure_credential() -> CredentialType:
    """Return an Azure credential instance.

    Order of preference when USE_MANAGED_IDENTITY env flag is truthy:
      1. ManagedIdentityCredential (if available & succeeds)
      2. DefaultAzureCredential

    Raises RuntimeError if azure-identity is not installed.
    """
    if DefaultAzureCredential is None:  # both will be None if import failed
        raise RuntimeError("azure-identity not installed; cannot construct credential")

    use_mi_flag = os.getenv("USE_MANAGED_IDENTITY", "false").lower() in {"1", "true", "yes", "on"}

    if use_mi_flag and ManagedIdentityCredential is not None:
        try:
            cred = ManagedIdentityCredential()
            _LOG.info("Using ManagedIdentityCredential")
            return cred
        except Exception as e:  # noqa: BLE001
            _LOG.warning("ManagedIdentityCredential failed (%s); falling back to DefaultAzureCredential", e)

    _LOG.info("Using DefaultAzureCredential")
    return DefaultAzureCredential()

__all__ = ["get_azure_credential", "CredentialType"]
