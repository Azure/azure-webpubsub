import pytest
from python_server.core.room_store import InMemoryRoomStore, DEFAULT_ROOM_ID

@pytest.mark.asyncio
async def test_memory_store_register_and_list():
    store = InMemoryRoomStore()
    # register_room keeps backwards compat but should create metadata
    await store.register_room('alpha')
    rooms = await store.list_rooms()
    names = {r['name'] for r in rooms}
    assert 'alpha' in names

@pytest.mark.asyncio
async def test_memory_store_append_and_limit():
    store = InMemoryRoomStore(max_messages=3)
    for i in range(5):
        await store.append_message('public', {'id': i})
    msgs = await store.get_room_messages('public')
    assert len(msgs) == 3
    ids = [m['id'] for m in msgs]
    assert ids == [2,3,4]

@pytest.mark.asyncio
async def test_register_room_creates_room_by_name():
    store = InMemoryRoomStore()
    await store.register_room('myroom')
    rooms = await store.list_rooms()
    names = {r['name'] for r in rooms}
    assert 'myroom' in names

@pytest.mark.asyncio
async def test_remove_room_if_empty_removes_room():
    store = InMemoryRoomStore()
    await store.register_room('temp')
    # ensure appears
    assert any(r['name'] == 'temp' for r in await store.list_rooms())
    # remove since empty
    await store.remove_room_if_empty('temp')
    assert all(r['name'] != 'temp' for r in await store.list_rooms())
    # default room is never removed even if empty
    await store.remove_room_if_empty(DEFAULT_ROOM_ID)
    assert any(r['name'] == DEFAULT_ROOM_ID for r in await store.list_rooms())
