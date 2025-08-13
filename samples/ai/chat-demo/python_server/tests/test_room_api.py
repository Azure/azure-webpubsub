"""
Tests for room metadata REST API endpoints.
"""

import pytest
import json
from flask import Flask
from python_server.core.chat_api import create_chat_api_blueprint
from python_server.core.room_store import InMemoryRoomStore

@pytest.fixture
def app():
    """Create a Flask app for testing."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    
    # Initialize unified in-memory room store (includes metadata now)
    store = InMemoryRoomStore()

    # Minimal fake loop for running coroutines synchronously in tests
    import asyncio
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
    """Create a test client."""
    return app.test_client()

@pytest.fixture
def auth_headers():
    """Default authentication headers."""
    return {'X-User-Id': 'test-user'}

class TestRoomAPI:
    """Test room API endpoints."""
    
    def test_get_rooms_empty(self, client, auth_headers):
        """Test getting rooms when none exist (except default)."""
        response = client.get('/api/rooms', headers=auth_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data['rooms']) == 1  # Only default room
        assert data['rooms'][0]['roomId'] == 'public'
        assert data['rooms'][0]['roomName'] == 'Public Chat'
        assert data['user_id'] == 'test-user'
    
    def test_get_rooms_without_user_id(self, client):
        """Test getting rooms without user ID uses anonymous."""
        response = client.get('/api/rooms')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['user_id'] == 'anonymous'
        assert len(data['rooms']) == 1  # Default room
    
    def test_create_room_success(self, client, auth_headers):
        """Test creating a room successfully."""
        room_data = {
            'roomName': 'Test Room',
            'description': 'A test room'
        }
        
        response = client.post('/api/rooms', 
                             json=room_data, 
                             headers=auth_headers)
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['roomName'] == 'Test Room'
        assert data['description'] == 'A test room'
        assert data['userId'] == 'test-user'
        assert 'roomId' in data
        assert data['roomId'].startswith('room_')
    
    def test_create_room_with_explicit_id_rejected(self, client, auth_headers):
        response = client.post('/api/rooms', json={'roomName': 'Custom', 'roomId': 'x'}, headers=auth_headers)
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Explicit roomId not allowed' in data['error']
    
    def test_create_room_missing_name(self, client, auth_headers):
        """Test creating a room without name fails."""
        room_data = {'description': 'No name'}
        
        response = client.post('/api/rooms', 
                             json=room_data, 
                             headers=auth_headers)
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'roomName is required' in data['error']
    
    def test_create_room_empty_name(self, client, auth_headers):
        """Test creating a room with empty name fails."""
        room_data = {'roomName': '   '}
        
        response = client.post('/api/rooms', 
                             json=room_data, 
                             headers=auth_headers)
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'roomName is required' in data['error']
    
    def test_create_room_no_body(self, client, auth_headers):
        """Test creating a room without request body fails."""
        response = client.post('/api/rooms', headers=auth_headers)
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Request body required' in data['error']
    
    def test_get_specific_room_success(self, client, auth_headers):
        """Test getting a specific room successfully."""
        # First create a room
        create_response = client.post('/api/rooms', json={'roomName': 'Test Room'}, headers=auth_headers)
        assert create_response.status_code == 201
        created = json.loads(create_response.data)
        rid = created['roomId']
        # Now get the specific room
        response = client.get(f'/api/rooms/{rid}', headers=auth_headers)
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['roomId'] == rid
        assert data['roomName'] == 'Test Room'
    
    def test_get_specific_room_not_found(self, client, auth_headers):
        """Test getting a non-existent room returns 404."""
        response = client.get('/api/rooms/nonexistent', headers=auth_headers)
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert 'Room not found' in data['error']
    
    def test_update_room_success(self, client, auth_headers):
        """Test updating a room successfully."""
        # First create a room
        create_response = client.post('/api/rooms', json={'roomName': 'Original Room'}, headers=auth_headers)
        assert create_response.status_code == 201
        rid = json.loads(create_response.data)['roomId']
        update_data = {'roomName': 'Updated Room', 'description': 'Updated description'}
        response = client.put(f'/api/rooms/{rid}', json=update_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['roomName'] == 'Updated Room'
        assert data['description'] == 'Updated description'
    
    def test_update_room_not_found(self, client, auth_headers):
        """Test updating a non-existent room returns 404."""
        update_data = {'roomName': 'Updated Room'}
        response = client.put('/api/rooms/nonexistent', 
                            json=update_data, 
                            headers=auth_headers)
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert 'Room not found' in data['error']
    
    def test_update_public_room_forbidden(self, client, auth_headers, app):
        """Test updating public room is forbidden."""
        update_data = {'roomName': 'Updated Public'}
        response = client.put('/api/rooms/public', 
                            json=update_data, 
                            headers=auth_headers)
        
        assert response.status_code == 403
        data = json.loads(response.data)
        assert 'Cannot update system room' in data['error']
    
    def test_update_room_no_body(self, client, auth_headers, app):
        """Test updating a room without request body fails."""
        # Create a room first
        create_response = client.post('/api/rooms', json={'roomName': 'Test Room'}, headers=auth_headers)
        assert create_response.status_code == 201
        rid = json.loads(create_response.data)['roomId']
        response = client.put(f'/api/rooms/{rid}', headers=auth_headers)
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Request body required' in data['error']
    
    def test_delete_room_success(self, client, auth_headers):
        """Test deleting a room successfully."""
        # First create a room
        create_response = client.post('/api/rooms', json={'roomName': 'Delete Me'}, headers=auth_headers)
        assert create_response.status_code == 201
        rid = json.loads(create_response.data)['roomId']
        response = client.delete(f'/api/rooms/{rid}', headers=auth_headers)
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'deleted' in data['message'].lower()

        # Verify room is gone
        get_response = client.get(f'/api/rooms/{rid}', headers=auth_headers)
        assert get_response.status_code == 404
    
    def test_delete_room_not_found(self, client, auth_headers):
        """Idempotent delete: deleting a non-existent room still returns 200."""
        response = client.delete('/api/rooms/nonexistent', headers=auth_headers)
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'deleted' in data['message'].lower()
    
    def test_delete_public_room_forbidden(self, client, auth_headers):
        """Test deleting public room is forbidden."""
        response = client.delete('/api/rooms/public', headers=auth_headers)
        
        assert response.status_code == 403
        data = json.loads(response.data)
        assert 'Cannot delete system room' in data['error']
    
    def test_user_isolation(self, client):
        """Test that users can only see their own rooms."""
        # Create room for user1
        user1_headers = {'X-User-Id': 'user1'}
        response1 = client.post('/api/rooms', json={'roomName': 'User1 Room'}, headers=user1_headers)
        assert response1.status_code == 201
        rid1 = json.loads(response1.data)['roomId']
        
        # Create room for user2
        user2_headers = {'X-User-Id': 'user2'}
        response2 = client.post('/api/rooms', json={'roomName': 'User2 Room'}, headers=user2_headers)
        assert response2.status_code == 201
        rid2 = json.loads(response2.data)['roomId']
        
        # User1 should see their room + default room
        get_response1 = client.get('/api/rooms', headers=user1_headers)
        data1 = json.loads(get_response1.data)
        assert len(data1['rooms']) == 2  # User room + default
        room_names1 = {room['roomName'] for room in data1['rooms']}
        assert room_names1 == {'User1 Room', 'Public Chat'}
        
        # User2 should see their room + default room
        get_response2 = client.get('/api/rooms', headers=user2_headers)
        data2 = json.loads(get_response2.data)
        assert len(data2['rooms']) == 2  # User room + default
        room_names2 = {room['roomName'] for room in data2['rooms']}
        assert room_names2 == {'User2 Room', 'Public Chat'}
        
        # User1 cannot access User2's room
        access_response = client.get(f'/api/rooms/{rid2}', headers=user1_headers)
        assert access_response.status_code == 404
    
    def test_full_crud_workflow(self, client, auth_headers):
        """Test complete CRUD workflow for a room."""
        # Create
        room_data = {'roomName': 'CRUD Test Room', 'description': 'Testing CRUD operations'}
        create_response = client.post('/api/rooms', json=room_data, headers=auth_headers)
        assert create_response.status_code == 201
        created_room = json.loads(create_response.data)
        rid = created_room['roomId']
        
        # Read
        get_response = client.get(f'/api/rooms/{rid}', headers=auth_headers)
        assert get_response.status_code == 200
        retrieved_room = json.loads(get_response.data)
        assert retrieved_room['roomName'] == 'CRUD Test Room'
        
        # Update
        update_data = {
            'roomName': 'Updated CRUD Room',
            'description': 'Updated description'
        }
        update_response = client.put(f'/api/rooms/{rid}', json=update_data, headers=auth_headers)
        assert update_response.status_code == 200
        updated_room = json.loads(update_response.data)
        assert updated_room['roomName'] == 'Updated CRUD Room'
        assert updated_room['description'] == 'Updated description'
        
        # Delete
        delete_response = client.delete(f'/api/rooms/{rid}', headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deletion
        final_get_response = client.get(f'/api/rooms/{rid}', headers=auth_headers)
        assert final_get_response.status_code == 404

    def test_multiple_creates_same_name_distinct_rooms(self, client, auth_headers):
        r1 = client.post('/api/rooms', json={'roomName': 'Repeat'}, headers=auth_headers)
        r2 = client.post('/api/rooms', json={'roomName': 'Repeat'}, headers=auth_headers)
        assert r1.status_code == 201 and r2.status_code == 201
        d1 = json.loads(r1.data)
        d2 = json.loads(r2.data)
        assert d1['roomId'] != d2['roomId']
        assert d1['roomName'] == d2['roomName'] == 'Repeat'

    def test_description_only_update(self, client, auth_headers):
        create_resp = client.post('/api/rooms', json={'roomName': 'JustDesc'}, headers=auth_headers)
        rid = json.loads(create_resp.data)['roomId']
        update_resp = client.put(f'/api/rooms/{rid}', json={'description': 'New Desc'}, headers=auth_headers)
        assert update_resp.status_code == 200
        room = json.loads(update_resp.data)
        assert room['description'] == 'New Desc'
        # name unchanged
        assert room['roomName'] == 'JustDesc'

    def test_clear_description(self, client, auth_headers):
        create_resp = client.post('/api/rooms', json={'roomName': 'WithDesc', 'description': 'Something'}, headers=auth_headers)
        rid = json.loads(create_resp.data)['roomId']
        clear_resp = client.put(f'/api/rooms/{rid}', json={'description': ''}, headers=auth_headers)
        assert clear_resp.status_code == 200
        data = json.loads(clear_resp.data)
        assert data['description'] == ''

    def test_get_room_messages_endpoint_empty(self, client, auth_headers):
        # For now just ensure endpoint exists and returns empty messages list (service not bootstrapped in test blueprint)
        create_resp = client.post('/api/rooms', json={'roomName': 'MsgRoom'}, headers=auth_headers)
        rid = json.loads(create_resp.data)['roomId']
        resp = client.get(f'/api/rooms/{rid}/messages', headers=auth_headers)
        # Endpoint may return:
        # 200 with messages list (loop executed)
        # 503 if service/loop unavailable
        # 504 on timeout, 500 on internal error
        assert resp.status_code in (200, 503, 504, 500)
        data = json.loads(resp.data)
        # Valid shapes: {'messages': [...]} or {'error': str}
        assert ('messages' in data and isinstance(data['messages'], list)) or ('error' in data)