from python_server.core.runtime_config import resolve_runtime_config, TransportMode, StorageMode
import os
import pytest


def test_default_modes():
    cfg = resolve_runtime_config()
    assert cfg.transport == TransportMode.SELF
    assert cfg.storage == StorageMode.MEMORY


def test_explicit_modes_valid(monkeypatch):
    monkeypatch.setenv('TRANSPORT_MODE','webpubsub')
    monkeypatch.setenv('WEBPUBSUB_ENDPOINT','https://example.webpubsub.azure.com')
    monkeypatch.setenv('STORAGE_MODE','memory')
    cfg = resolve_runtime_config()
    assert cfg.transport == TransportMode.WEBPUBSUB
    assert cfg.storage == StorageMode.MEMORY


def test_transport_requires_credentials(monkeypatch):
    monkeypatch.setenv('TRANSPORT_MODE','webpubsub')
    with pytest.raises(RuntimeError):
        resolve_runtime_config()


def test_storage_requires_credentials(monkeypatch):
    monkeypatch.setenv('STORAGE_MODE','table')
    with pytest.raises(RuntimeError):
        resolve_runtime_config()


def test_invalid_transport(monkeypatch):
    monkeypatch.setenv('TRANSPORT_MODE','bogus')
    with pytest.raises(RuntimeError):
        resolve_runtime_config()


def test_invalid_storage(monkeypatch):
    monkeypatch.setenv('STORAGE_MODE','bogus')
    with pytest.raises(RuntimeError):
        resolve_runtime_config()
