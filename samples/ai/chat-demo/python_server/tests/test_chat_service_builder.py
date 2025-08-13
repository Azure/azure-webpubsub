import pytest
from python_server.core.chat_service import build_chat_service
from python_server.core.room_store import InMemoryRoomStore
from python_server.core.runtime_config import TransportMode

class DummyLogger:
    def info(self, *a, **k): pass
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass

@pytest.mark.asyncio
async def test_build_self_transport():
    store = InMemoryRoomStore()
    svc = build_chat_service(None, 'localhost', 5001, store, DummyLogger(), transport_mode=TransportMode.SELF)
    # Self transport returns ChatService with expected room_store
    assert hasattr(svc, 'room_store')
    assert svc.room_store is store

def test_build_webpubsub_missing_creds():
    store = InMemoryRoomStore()
    with pytest.raises(RuntimeError):
        build_chat_service(None, 'localhost', 5001, store, DummyLogger(), transport_mode=TransportMode.WEBPUBSUB)
