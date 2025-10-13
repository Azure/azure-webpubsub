"""
Chat API feature tests consolidated:
- Rooms CRUD: list/get/create/update/delete + validations
- Messages endpoint: limit clamping + service-unavailable path
- Location header on create
"""

import json
import asyncio
import pytest
from flask import Flask

from ..core.chat_api import create_chat_api_blueprint
from ..core.room_store import InMemoryRoomStore


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    store = InMemoryRoomStore()
    loop = asyncio.new_event_loop()
    app._test_loop = loop  # type: ignore[attr-defined]
    bp = create_chat_api_blueprint(
        room_store_ref=lambda: store,
        chat_service_ref=lambda: type('X', (), {'room_store': store})(),
        event_loop_ref=lambda: loop,
    )
    app.register_blueprint(bp)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_headers():
    return {'X-User-Id': 'test-user'}


class TestRoomsCrud:
    def test_get_rooms_empty(self, client, auth_headers):
        resp = client.get('/api/rooms', headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data, dict)
        assert data['user_id'] == 'test-user'
        assert len(data['rooms']) == 1
        assert data['rooms'][0]['roomId'] == 'public'

    def test_get_rooms_without_user_id(self, client):
        resp = client.get('/api/rooms')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['user_id'] == 'anonymous'

    def test_create_room_success(self, client, auth_headers):
        resp = client.post('/api/rooms', json={'roomName': 'Test Room', 'description': 'A test room'}, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['roomName'] == 'Test Room'
        assert data['description'] == 'A test room'
        assert data['userId'] == 'test-user'
        assert data['roomId'].startswith('room_')

    def test_create_room_with_explicit_id_rejected(self, client, auth_headers):
        resp = client.post('/api/rooms', json={'roomName': 'Custom', 'roomId': 'x'}, headers=auth_headers)
        assert resp.status_code == 400
        assert 'Explicit roomId not allowed' in resp.get_json()['error']

    def test_create_room_missing_name(self, client, auth_headers):
        resp = client.post('/api/rooms', json={'description': 'No name'}, headers=auth_headers)
        assert resp.status_code == 400
        assert 'roomName is required' in resp.get_json()['error']

    def test_create_room_empty_name(self, client, auth_headers):
        resp = client.post('/api/rooms', json={'roomName': '   '}, headers=auth_headers)
        assert resp.status_code == 400
        assert 'roomName is required' in resp.get_json()['error']

    def test_create_room_no_body(self, client, auth_headers):
        resp = client.post('/api/rooms', headers=auth_headers)
        assert resp.status_code == 400
        assert 'Request body required' in resp.get_json()['error']

    def test_get_specific_room_success(self, client, auth_headers):
        created = client.post('/api/rooms', json={'roomName': 'Test Room'}, headers=auth_headers).get_json()
        rid = created['roomId']
        resp = client.get(f'/api/rooms/{rid}', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()['roomId'] == rid

    def test_get_specific_room_not_found(self, client, auth_headers):
        resp = client.get('/api/rooms/nonexistent', headers=auth_headers)
        assert resp.status_code == 404
        assert 'Room not found' in resp.get_json()['error']

    def test_update_room_success(self, client, auth_headers):
        rid = client.post('/api/rooms', json={'roomName': 'Original'}, headers=auth_headers).get_json()['roomId']
        resp = client.put(f'/api/rooms/{rid}', json={'roomName': 'Updated', 'description': 'D'}, headers=auth_headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['roomName'] == 'Updated' and body['description'] == 'D'

    def test_update_room_not_found(self, client, auth_headers):
        resp = client.put('/api/rooms/missing', json={'roomName': 'X'}, headers=auth_headers)
        assert resp.status_code == 404
        assert 'Room not found' in resp.get_json()['error']

    def test_update_public_room_forbidden(self, client, auth_headers):
        resp = client.put('/api/rooms/public', json={'roomName': 'X'}, headers=auth_headers)
        assert resp.status_code == 403
        assert 'Cannot update system room' in resp.get_json()['error']

    def test_update_room_no_body(self, client, auth_headers):
        rid = client.post('/api/rooms', json={'roomName': 'R'}, headers=auth_headers).get_json()['roomId']
        resp = client.put(f'/api/rooms/{rid}', headers=auth_headers)
        assert resp.status_code == 400
        assert 'Request body required' in resp.get_json()['error']

    def test_delete_room_success_and_idempotent(self, client, auth_headers):
        rid = client.post('/api/rooms', json={'roomName': 'Del'}, headers=auth_headers).get_json()['roomId']
        resp = client.delete(f'/api/rooms/{rid}', headers=auth_headers)
        assert resp.status_code == 200
        # Deleting again remains 200
        resp2 = client.delete(f'/api/rooms/{rid}', headers=auth_headers)
        assert resp2.status_code == 200

    def test_delete_public_room_forbidden(self, client, auth_headers):
        resp = client.delete('/api/rooms/public', headers=auth_headers)
        assert resp.status_code == 403
        assert 'Cannot delete system room' in resp.get_json()['error']

    def test_user_isolation(self, client):
        u1 = {'X-User-Id': 'u1'}
        u2 = {'X-User-Id': 'u2'}
        r1 = client.post('/api/rooms', json={'roomName': 'R1'}, headers=u1).get_json()['roomId']
        _ = client.post('/api/rooms', json={'roomName': 'R2'}, headers=u2).get_json()['roomId']
        data1 = client.get('/api/rooms', headers=u1).get_json()
        names1 = {r['roomName'] for r in data1['rooms']}
        assert names1 == {'R1', 'Public Chat'}
        # u1 cannot access u2's room
        assert client.get(f'/api/rooms/{r1}', headers=u2).status_code == 404

    def test_location_header_on_create(self, client):
        resp = client.post('/api/rooms', json={'roomName': 'LocRoom'}, headers={'X-User-Id': 'u'})
        assert resp.status_code == 201
        rid = resp.get_json()['roomId']
        loc = resp.headers.get('Location')
        assert isinstance(loc, str) and loc.endswith(f'/api/rooms/{rid}')


class TestMessagesEndpoint:
    def test_messages_limit_is_clamped(self):
        class _FakeStore:
            def __init__(self):
                self.last_limit = None
            async def get_room_messages(self, room: str, limit: int | None = None):
                self.last_limit = limit
                return []

        app = Flask(__name__)
        app.config['TESTING'] = True
        store = _FakeStore()
        loop = asyncio.new_event_loop()
        app._test_loop = loop  # type: ignore[attr-defined]
        svc = type('Svc', (), {'room_store': store})()
        bp = create_chat_api_blueprint(
            room_store_ref=lambda: store,
            chat_service_ref=lambda: svc,
            event_loop_ref=lambda: loop,
        )
        app.register_blueprint(bp)
        client = app.test_client()
        resp = client.get('/api/rooms/public/messages?limit=99999')
        assert resp.status_code in (200, 503, 504, 500)
        assert store.last_limit is not None and store.last_limit <= 500

    def test_messages_endpoint_service_unavailable(self):
        app = Flask(__name__)
        app.config['TESTING'] = True
        store = InMemoryRoomStore()
        loop = asyncio.new_event_loop()
        bp = create_chat_api_blueprint(room_store_ref=lambda: store, chat_service_ref=lambda: None, event_loop_ref=lambda: loop)
        app.register_blueprint(bp)
        client = app.test_client()
        resp = client.get('/api/rooms/public/messages', headers={'X-User-Id': 'userX'})
        assert resp.status_code == 503
        assert 'Service unavailable' in resp.get_json()['error']

