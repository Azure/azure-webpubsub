"""
Shared state and utility functions for chat-demo python server.
"""
import uuid
import json

def generate_id(prefix):
    """Generate a unique identifier"""
    return f"{prefix}_{uuid.uuid4()}"


def get_query_value(path, key):
    """Extract query parameter from WebSocket path"""
    if '?' in path:
        query_string = path.split('?', 1)[1]
        params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
        return params.get(key)


def get_room_id(path, default_room_id):
    """Extract room ID from query parameters in path"""
    return get_query_value(path, 'roomId') or default_room_id
