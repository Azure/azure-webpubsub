import json
import asyncio
import pytest
from flask import Flask
from python_server.core.chat_api import create_chat_api_blueprint
from python_server.core.room_store import InMemoryRoomStore

@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    store = InMemoryRoomStore()
    loop = asyncio.new_event_loop()
    app._test_loop = loop  # type: ignore[attr-defined]
    chat_bp = create_chat_api_blueprint(
        room_store_ref=lambda: store,
        chat_service_ref=lambda: type('X', (), {'room_store': store})(),
        event_loop_ref=lambda: loop,
    )
    app.register_blueprint(chat_bp)
    return app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def auth_headers():
    return {'X-User-Id': 'userX'}

class TestRoomApiExtended:
    def test_update_whitespace_name_noop(self, client, auth_headers):
        # create room
        r = client.post('/api/rooms', json={'roomName': 'Alpha'}, headers=auth_headers)
        rid = json.loads(r.data)['roomId']
        # update with whitespace only name -> name should remain unchanged
        upd = client.put(f'/api/rooms/{rid}', json={'roomName': '   '}, headers=auth_headers)
        assert upd.status_code == 200
        body = json.loads(upd.data)
        assert body['roomName'] == 'Alpha'

    def test_update_whitespace_description_noop(self, client, auth_headers):
        r = client.post('/api/rooms', json={'roomName': 'Beta', 'description': 'Original'}, headers=auth_headers)
        rid = json.loads(r.data)['roomId']
        upd = client.put(f'/api/rooms/{rid}', json={'description': '   '}, headers=auth_headers)
        assert upd.status_code == 200
        body = json.loads(upd.data)
        assert body['description'] == 'Original'

    def test_clear_description_empty_string(self, client, auth_headers):
        r = client.post('/api/rooms', json={'roomName': 'Gamma', 'description': 'Desc'}, headers=auth_headers)
        rid = json.loads(r.data)['roomId']
        upd = client.put(f'/api/rooms/{rid}', json={'description': ''}, headers=auth_headers)
        assert upd.status_code == 200
        body = json.loads(upd.data)
        assert body['description'] == ''

    def test_messages_endpoint_service_unavailable(self, app, auth_headers):
        # Recreate blueprint with chat_service_ref returning None to simulate service unavailable
        app2 = Flask(__name__)
        store = InMemoryRoomStore()
        loop = asyncio.new_event_loop()
        bp = create_chat_api_blueprint(room_store_ref=lambda: store, chat_service_ref=lambda: None, event_loop_ref=lambda: loop)
        app2.register_blueprint(bp)
        c = app2.test_client()
        resp = c.get('/api/rooms/public/messages', headers=auth_headers)
        assert resp.status_code == 503
        body = json.loads(resp.data)
        assert 'Service unavailable' in body['error']
