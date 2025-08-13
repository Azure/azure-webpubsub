import pytest
from python_server.core.room_store import InMemoryRoomStore, RoomMetadata, DEFAULT_ROOM_ID

@pytest.mark.asyncio
async def test_create_room_metadata_auto_id():
    store = InMemoryRoomStore()
    room = await store.create_room_metadata('user1', 'My Room')
    assert room.room_id.startswith('room_')
    assert room.room_name == 'My Room'
    # default room always present
    listed = await store.list_user_rooms('user1')
    ids = {r.room_id for r in listed}
    assert DEFAULT_ROOM_ID in ids and room.room_id in ids

@pytest.mark.asyncio
async def test_create_room_metadata_custom_id_and_duplicate():
    store = InMemoryRoomStore()
    r1 = await store.create_room_metadata('u', 'First', room_id='custom1')
    assert r1.room_id == 'custom1'
    r2 = await store.create_room_metadata('u', 'Again', room_id='custom1')
    # Idempotent: returns existing metadata, original name preserved
    assert r2 is r1
    assert r2.room_name == 'First'

@pytest.mark.asyncio
async def test_get_update_delete_metadata_flow():
    store = InMemoryRoomStore()
    created = await store.create_room_metadata('u2', 'Original', room_id='rX', description='desc')
    fetched = await store.get_room_metadata('u2', 'rX')
    assert fetched is not None and fetched.room_name == 'Original'
    updated = await store.update_room_metadata('u2', 'rX', room_name='Renamed', description='new')
    assert updated.room_name == 'Renamed' and updated.description == 'new'
    # clear description
    updated2 = await store.update_room_metadata('u2', 'rX', description='')
    assert updated2.description == ''
    deleted = await store.delete_room_metadata('u2', 'rX')
    assert deleted is True
    assert await store.get_room_metadata('u2', 'rX') is None

@pytest.mark.asyncio
async def test_room_exists_and_public_always_exists():
    store = InMemoryRoomStore()
    assert await store.room_exists('any', DEFAULT_ROOM_ID) is True
    assert await store.room_exists('u3', 'missing') is False
    await store.create_room_metadata('u3', 'Room', room_id='r1')
    assert await store.room_exists('u3', 'r1') is True

@pytest.mark.asyncio
async def test_list_user_rooms_isolation():
    store = InMemoryRoomStore()
    await store.create_room_metadata('alice', 'A1', room_id='a1')
    await store.create_room_metadata('bob', 'B1', room_id='b1')
    alice_rooms = await store.list_user_rooms('alice')
    bob_rooms = await store.list_user_rooms('bob')
    assert {'a1', DEFAULT_ROOM_ID} == {r.room_id for r in alice_rooms}
    assert {'b1', DEFAULT_ROOM_ID} == {r.room_id for r in bob_rooms}
