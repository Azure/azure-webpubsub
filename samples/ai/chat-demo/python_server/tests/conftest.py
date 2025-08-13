import os
import pytest

@pytest.fixture(autouse=True)
def clear_env(monkeypatch):
    # Ensure test isolation for mode-related env vars
    for var in [
        'TRANSPORT_MODE','STORAGE_MODE','WEBPUBSUB_ENDPOINT','WEB_PUBSUB_ENDPOINT',
        'WEBPUBSUB_CONNECTION_STRING','WEB_PUBSUB_CONNECTION_STRING',
        'AZURE_STORAGE_CONNECTION_STRING','AZURE_STORAGE_ACCOUNT','CHAT_TABLE_NAME'
    ]:
        monkeypatch.delenv(var, raising=False)
    # Default modes
    monkeypatch.setenv('TRANSPORT_MODE','self')
    monkeypatch.setenv('STORAGE_MODE','memory')
    yield
