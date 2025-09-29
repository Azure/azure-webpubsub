import asyncio
import json
import types
from typing import List

from python_server.chat_service.self_host_chat_service import _InMemoryClientManager, SendResult, ClientConnectionContext

class DummyWS:
    def __init__(self):
        self.sent: List[str] = []
    async def send(self, data: str):  # mimic websockets send
        # allow JSON validation but store raw
        json.loads(data)  # will raise if invalid
        self.sent.append(data)

async def _prep(group: str = "room_abc"):
    mgr = _InMemoryClientManager()
    # fabricate contexts + transports
    c1 = ClientConnectionContext("/ws", "c1")
    c2 = ClientConnectionContext("/ws", "c2")
    ws1, ws2 = DummyWS(), DummyWS()
    await mgr.add_client("c1", c1, ws1)
    await mgr.add_client("c2", c2, ws2)
    await mgr.add_client_to_group("c1", group)
    await mgr.add_client_to_group("c2", group)
    return mgr, ws1, ws2, group

async def test_send_to_group_exclusion():
    mgr, ws1, ws2, group = await _prep()
    payload = json.dumps({"x": 1})
    results = await mgr.send_to_group(group, payload, exclude_ids=["c2"])  # exclude second
    assert any(r.connection_id == "c1" and r.ok for r in results)
    assert all(r.connection_id != "c2" for r in results)
    assert ws1.sent and ws1.sent[0] == payload
    assert not ws2.sent

async def test_remove_client_prunes_group():
    mgr, ws1, ws2, group = await _prep()
    await mgr.remove_client("c2")
    # send again
    payload = json.dumps({"m": 1})
    await mgr.send_to_group(group, payload)
    # only first client got message
    assert ws1.sent and ws1.sent[0] == payload
    assert not ws2.sent
    # c2 removed
    assert "c2" not in mgr.client_ids()

async def test_group_members_snapshot():
    mgr, ws1, ws2, group = await _prep()
    members = mgr.group_members(group)
    assert members == {"c1", "c2"}

# Allow running via `python -m unittest` by exposing a sync wrapper
import unittest
class ClientManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_to_group_exclusion(self):
        await test_send_to_group_exclusion()
    async def test_remove_client_prunes_group(self):
        await test_remove_client_prunes_group()
    async def test_group_members_snapshot(self):
        await test_group_members_snapshot()

if __name__ == '__main__':  # pragma: no cover
    unittest.main()
