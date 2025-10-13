import os
import sys
from pathlib import Path
import pytest

# Ensure project root is on sys.path so `import python_server` works when tests
# run from environments that don't automatically include CWD.
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

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
