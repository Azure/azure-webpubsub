import pytest
from python_server.core.room_store import InMemoryRoomStore, DEFAULT_ROOM_ID

@pytest.mark.asyncio
async def test_remove_room_if_empty_skips_default():
    store = InMemoryRoomStore()
    await store.register_room('deleteme')
    assert any(r['name'] == 'deleteme' for r in await store.list_rooms())
    await store.remove_room_if_empty('deleteme')
    assert all(r['name'] != 'deleteme' for r in await store.list_rooms())
    # default room not removed
    await store.remove_room_if_empty(DEFAULT_ROOM_ID)
    assert any(r['name'] == DEFAULT_ROOM_ID for r in await store.list_rooms())
