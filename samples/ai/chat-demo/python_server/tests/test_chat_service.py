"""
Chat service tests consolidated:
- Builder behavior for SELF/WEBPUBSUB
- In-memory client manager group operations
- ConnectionTaskManager scheduling/cancel
- Self-host websocket transport emits connected system event
- Server negotiate endpoint smoke test
"""

import os
import time
import json
import asyncio
import socket
import threading
import importlib
import contextlib
import pytest

from ..chat_service.factory import build_chat_service
from ..core.room_store import InMemoryRoomStore
from ..core.runtime_config import TransportMode
from ..task_manager import ConnectionTaskManager
from ..chat_service.transports.self_host import _InMemoryClientManager, SendResult, ChatService as SelfChatService
from ..chat_service.base import ClientConnectionContext


class DummyLogger:
    def info(self, *a, **k): pass
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass


@pytest.mark.asyncio
async def test_build_self_transport():
    store = InMemoryRoomStore()
    svc = build_chat_service(None, 'localhost', 5001, store, DummyLogger(), transport_mode=TransportMode.SELF)
    assert hasattr(svc, 'room_store') and svc.room_store is store


def test_build_webpubsub_missing_creds():
    store = InMemoryRoomStore()
    with pytest.raises(RuntimeError):
        build_chat_service(None, 'localhost', 5001, store, DummyLogger(), transport_mode=TransportMode.WEBPUBSUB)


async def _prep_group():
    mgr = _InMemoryClientManager()
    c1 = ClientConnectionContext("/ws", "c1")
    c2 = ClientConnectionContext("/ws", "c2")
    class DummyWS:
        def __init__(self): self.sent = []
        async def send(self, data: str): json.loads(data); self.sent.append(data)
    ws1, ws2 = DummyWS(), DummyWS()
    await mgr.add_client("c1", c1, ws1)
    await mgr.add_client("c2", c2, ws2)
    await mgr.add_client_to_group("c1", "g")
    await mgr.add_client_to_group("c2", "g")
    return mgr, ws1, ws2


@pytest.mark.asyncio
async def test_client_manager_send_and_exclusion():
    mgr, ws1, ws2 = await _prep_group()
    payload = json.dumps({"x": 1})
    results = await mgr.send_to_group("g", payload, exclude_ids=["c2"])  # exclude second
    assert any(r.connection_id == "c1" and r.ok for r in results)
    assert all(r.connection_id != "c2" for r in results)
    assert ws1.sent and not ws2.sent


@pytest.mark.asyncio
async def test_client_manager_remove_and_membership():
    mgr, ws1, ws2 = await _prep_group()
    await mgr.remove_client("c2")
    payload = json.dumps({"m": 1})
    await mgr.send_to_group("g", payload)
    assert ws1.sent and not ws2.sent
    assert "c2" not in mgr.client_ids()
    assert mgr.group_members("g") == {"c1"}


@pytest.mark.asyncio
async def test_schedule_and_cancel_all():
    loop = asyncio.new_event_loop()
    t = threading.Thread(target=lambda: (asyncio.set_event_loop(loop), loop.run_forever()), daemon=True)
    t.start()
    mgr = ConnectionTaskManager(loop)
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def worker():
        started.set()
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:  # pragma: no cover
            cancelled.set()
            raise

    fut = mgr.schedule("c1", worker())
    await asyncio.wait_for(started.wait(), timeout=2)
    assert mgr.active_count("c1") == 1
    mgr.cancel_all("c1")
    try:
        await asyncio.wait_for(asyncio.wrap_future(fut), timeout=2)
    except asyncio.CancelledError:
        pass
    assert cancelled.is_set() or fut.cancelled()
    assert mgr.active_count("c1") == 0
    loop.call_soon_threadsafe(loop.stop)
    t.join(timeout=2)
    loop.close()


@pytest.mark.asyncio
async def test_self_host_emits_connected_system_message():
    # pick a free port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('localhost', 0))
        _h, free_port = s.getsockname()

    svc = SelfChatService()
    server_task = asyncio.create_task(svc.start_chat(host='localhost', port=free_port))
    await asyncio.sleep(0.05)
    uri = f"ws://localhost:{free_port}/ws"
    import websockets
    async with websockets.connect(uri, subprotocols=['json.reliable.webpubsub.azure.v1']) as ws:
        raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
        data = json.loads(raw)
        assert data.get('type') == 'system' and data.get('event') == 'connected'
        assert 'connectionId' in data
    await asyncio.wait_for(svc.stop(), timeout=2)
    await asyncio.sleep(0.05)
    if not server_task.done():
        server_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await server_task


@pytest.mark.timeout(15)
def test_server_negotiate_endpoint(monkeypatch):
    monkeypatch.setenv('TRANSPORT_MODE','self')
    monkeypatch.setenv('STORAGE_MODE','memory')
    appmod = importlib.import_module('python_server.app')
    client = appmod.app.test_client()
    deadline = time.time() + 5
    while time.time() < deadline:
        resp = client.get('/api/negotiate?roomId=public')
        if resp.status_code == 200:
            j = resp.get_json()
            assert isinstance(j, dict) and 'url' in j and isinstance(j['url'], str) and j['url']
            return
        time.sleep(0.1)
    pytest.fail('negotiate endpoint not ready in time')

