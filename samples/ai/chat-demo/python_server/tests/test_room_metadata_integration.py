"""
Integration tests for room metadata system with Flask application.
"""

import pytest
import os
from flask import Flask
from ..core.chat_api import create_chat_api_blueprint
from ..core.room_store import InMemoryRoomStore

class TestRoomMetadataIntegration:
    """Integration tests for room metadata with server setup."""
    
    @pytest.fixture
    def app(self):
        """Create a test Flask app with room metadata integration."""
        app = Flask(__name__)
        app.config['TESTING'] = True
        
        # Configure room metadata store
        store = InMemoryRoomStore()
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
    def client(self, app):
        """Create a test client."""
        return app.test_client()
    
    def test_server_has_room_metadata_store(self, app):
        """Test that server is properly configured with room metadata store."""
        # Unified store now embedded via closure; ensure blueprint routes exist by simple GET
        client = app.test_client()
        resp = client.get('/api/rooms', headers={'X-User-Id': 'ping'})
        assert resp.status_code == 200
    
    def test_end_to_end_room_operations(self, client):
        """Test complete room operations through the API."""
        headers = {'X-User-Id': 'integration-test-user'}
        
        # 1. Get initial rooms (should have default room)
        response = client.get('/api/rooms', headers=headers)
        assert response.status_code == 200
        initial_data = response.get_json()
        assert len(initial_data['rooms']) == 1
        assert initial_data['rooms'][0]['roomId'] == 'public'
        
        # 2. Create a new room
        create_data = {
            'roomName': 'Integration Test Room',
            'description': 'Room created by integration test'
        }
        response = client.post('/api/rooms', json=create_data, headers=headers)
        assert response.status_code == 201
        created_room = response.get_json()
        generated_id = created_room['roomId']
        assert generated_id.startswith('room_')
        assert created_room['roomName'] == 'Integration Test Room'
        
        # 3. Get all rooms (should now have 2 rooms)
        response = client.get('/api/rooms', headers=headers)
        assert response.status_code == 200
        all_rooms_data = response.get_json()
        assert len(all_rooms_data['rooms']) == 2
        room_ids = {room['roomId'] for room in all_rooms_data['rooms']}
        assert 'public' in room_ids and generated_id in room_ids and len(room_ids) == 2
        
        # 4. Get specific room
        response = client.get(f'/api/rooms/{generated_id}', headers=headers)
        assert response.status_code == 200
        specific_room = response.get_json()
        assert specific_room['roomName'] == 'Integration Test Room'
        assert specific_room['description'] == 'Room created by integration test'
        
        # 5. Update the room
        update_data = {
            'roomName': 'Updated Integration Room', 
            'description': 'Updated description'
        }
        response = client.put(f'/api/rooms/{generated_id}', json=update_data, headers=headers)
        assert response.status_code == 200
        updated_room = response.get_json()
        assert updated_room['roomName'] == 'Updated Integration Room'
        assert updated_room['description'] == 'Updated description'
        
        # 6. Delete the room
        response = client.delete(f'/api/rooms/{generated_id}', headers=headers)
        assert response.status_code == 200
        
        # 7. Verify room is deleted
        response = client.get(f'/api/rooms/{generated_id}', headers=headers)
        assert response.status_code == 404
        
        # 8. Get all rooms (should be back to just default)
        response = client.get('/api/rooms', headers=headers)
        assert response.status_code == 200
        final_data = response.get_json()
        assert len(final_data['rooms']) == 1
        assert final_data['rooms'][0]['roomId'] == 'public'
    
    def test_user_isolation_integration(self, client):
        """Test that different users see different rooms."""
        user1_headers = {'X-User-Id': 'user1'}
        user2_headers = {'X-User-Id': 'user2'}
        
        # User1 creates a room
        response = client.post('/api/rooms', json={'roomName': 'User1 Room'}, headers=user1_headers)
        assert response.status_code == 201
        user1_room_id = response.get_json()['roomId']
        
        # User2 creates a room
        response = client.post('/api/rooms', json={'roomName': 'User2 Room'}, headers=user2_headers)
        assert response.status_code == 201
        user2_room_id = response.get_json()['roomId']
        
        # User1 can see their room but not user2's room
        response = client.get('/api/rooms', headers=user1_headers)
        user1_data = response.get_json()
        room_ids1 = {room['roomId'] for room in user1_data['rooms']}
        assert user1_room_id in room_ids1
        assert user2_room_id not in room_ids1
        
        # User2 can see their room but not user1's room
        response = client.get('/api/rooms', headers=user2_headers)
        user2_data = response.get_json()
        room_ids2 = {room['roomId'] for room in user2_data['rooms']}
        assert user2_room_id in room_ids2
        assert user1_room_id not in room_ids2
        
        # User1 cannot access user2's room directly
        response = client.get(f'/api/rooms/{user2_room_id}', headers=user1_headers)
        assert response.status_code == 404
        
        # User2 cannot access user1's room directly  
        response = client.get(f'/api/rooms/{user1_room_id}', headers=user2_headers)
        assert response.status_code == 404
