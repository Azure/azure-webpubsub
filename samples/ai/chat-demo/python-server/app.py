import uuid
from flask import Flask, request, send_from_directory
from flask_cors import CORS
import json
import time
import os
import asyncio
import websockets
from websockets.server import serve
import threading
from werkzeug.serving import make_server
import signal
import sys
from dotenv import load_dotenv
from ai import chat_stream  # Import our AI module

# Load environment variables from .env file
load_dotenv()

# Configuration
host = "localhost"
port = 5000

# Flask app for HTTP endpoints
app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000"])

# Store connected clients by room
room_connections = {}

# Store conversation history by room
# Format: {room_id: [{"role": "user", "content": "message"}, {"role": "assistant", "content": "response"}]}
room_histories = {}

def add_to_history(room_id, role, user, content):
    """Add a message to the room's conversation history"""
    if room_id not in room_histories:
        room_histories[room_id] = []
    
    room_histories[room_id].append({
        "userId": user,
        "role": role,
        "content": content
    })
    
    # Keep only last 20 messages to avoid memory issues
    if len(room_histories[room_id]) > 20:
        room_histories[room_id] = room_histories[room_id][-20:]

def get_room_history(room_id):
    """Get the conversation history for a room"""
    return room_histories.get(room_id, [])

@app.route('/negotiate')
def negotiate():
    """Handle negotiation requests - return WebSocket URL"""
    room_id = request.args.get('roomId', 'public')
    user_id = request.args.get('userId', f'user_{generate_id()}')
    print(f"Negotiation request for room: {room_id}, user: {user_id}")
    
    # Return WebSocket URL using WebSocket port
    ws_url = f"ws://{host}:{port + 1}/ws?roomId={room_id}&userId={user_id}"
    return ws_url

@app.route('/')
def serve_client():
    """Serve the main React app"""
    return send_from_directory('../client/dist', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from React build"""
    return send_from_directory('../client/dist', path)

@app.route('/api/rooms')
def get_rooms():
    """Debug endpoint: Get all room information"""
    rooms_info = {}
    for room_id in room_connections:
        rooms_info[room_id] = {
            "connected_clients": len(room_connections[room_id]),
            "message_history_length": len(get_room_history(room_id)),
            "last_messages": get_room_history(room_id)[-3:] if get_room_history(room_id) else []
        }
    return json.dumps(rooms_info, indent=2)

@app.route('/api/rooms/<room_id>/history')
def get_room_history_api(room_id):
    """Debug endpoint: Get conversation history for a specific room"""
    history = get_room_history(room_id)
    return json.dumps({
        "room_id": room_id,
        "message_count": len(history),
        "history": history
    }, indent=2)

async def broadcast_to_room(room_id, message):
    """Broadcast a message to all clients in a room"""
    if room_id in room_connections:
        disconnected_clients = []
        for client in room_connections[room_id].copy():
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.append(client)
            except Exception as e:
                print(f"Error broadcasting to client: {e}")
                disconnected_clients.append(client)
        
        # Clean up disconnected clients
        for client in disconnected_clients:
            room_connections[room_id].discard(client)

async def handle_ai_response(websocket, room_id, user_message, user_name):
    """Handle AI response with streaming"""
    message_id = f"ai-{int(time.time() * 1000)}"
    
    try:
        # Send thinking indicator to all clients in room
        thinking_message = {
            "type": "message",
            "from": "group", 
            "group": room_id,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "message": "",
                "from": "AI Assistant",
                "streaming": True
            }
        }
        await broadcast_to_room(room_id, json.dumps(thinking_message))
        
        # Get conversation history for this room
        conversation_history = get_room_history(room_id)
        
        # Generate streaming AI response
        full_response = ""
        
        # Use asyncio to run the synchronous chat_stream in a thread
        import concurrent.futures
        loop = asyncio.get_event_loop()
        
        def get_ai_stream():
            return list(chat_stream(user_message, conversation_history=conversation_history))
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            # Run the chat_stream generator in the executor and collect chunks
            ai_chunks = await loop.run_in_executor(executor, get_ai_stream)
            
            # Stream the response chunks
            for chunk in ai_chunks:
                full_response += chunk
                
                # Send streaming chunk to all clients in room
                stream_message = {
                    "type": "message",
                    "from": "group",
                    "group": room_id,
                    "dataType": "json",
                    "data": {
                        "messageId": message_id,
                        "message": chunk,
                        "from": "AI Assistant",
                        "streaming": True
                    }
                }
                await broadcast_to_room(room_id, json.dumps(stream_message))
                
                # Small delay to make streaming visible
                await asyncio.sleep(0.05)
        
        # Send streaming end signal
        end_message = {
            "type": "message",
            "from": "group",
            "group": room_id,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "streaming": True,
                "streamingEnd": True,
                "from": "AI Assistant"
            }
        }
        await broadcast_to_room(room_id, json.dumps(end_message))
        
        # Add AI response to room history
        if full_response.strip():
            add_to_history(room_id, "assistant", "ai", full_response)
            print(f"AI responded in room {room_id}: {full_response[:100]}{'...' if len(full_response) > 100 else ''}")
        
    except Exception as e:
        print(f"Error in AI response: {e}")
        
        # Send error message
        error_message = {
            "type": "message",
            "from": "group",
            "group": room_id,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "message": f"Sorry, I encountered an error: {str(e)}",
                "from": "AI Assistant",
                "streaming": False
            }
        }
        await broadcast_to_room(room_id, json.dumps(error_message))

def generate_id():
    return str(uuid.uuid4())

async def join_group(room_id, connectionId):
    print(f"Adding {connectionId} to room: {room_id}")
    if room_id not in room_connections:
        room_connections[room_id] = set()
    # Add client to room
    room_connections[room_id].add(connectionId)
    # Send welcome message only if this is the first message in the room
    if len(get_room_history(room_id)) == 0:
        welcome_text = f"Hello! I'm your AI assistant for room {room_id}. How can I help you today?"
        add_to_history(room_id, "assistant", "ai", welcome_text)
        welcome_message = {
            "type": "message",
            "from": "group",
            "group": room_id,
            "dataType": "json",
            "data": {
                "messageId": generate_id(),
                "message": welcome_text,
                "from": "AI Assistant",
                "streaming": False
            }
        }
        await broadcast_to_room(room_id, json.dumps(welcome_message))
def get_query_value(path, key):
    if '?' in path:
        query_string = path.split('?', 1)[1]
        params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
        return params.get(key)

def get_room_id(path, default_room_id):
    # Extract room ID from query parameters in path, otherwise join "public" room
    return get_query_value(path, 'roomId') or default_room_id

# WebSocket handler using websockets library
async def websocket_handler(websocket, path):
    """Handle WebSocket connections with full subprotocol support"""
    try:
        # Get subprotocol from the WebSocket connection
        selected_subprotocol = websocket.subprotocol
        print(f"WebSocket connected with subprotocol: {selected_subprotocol}")
        
        # Generate connectionId
        connection_id = generate_id()
        user_id = get_query_value(path, 'userId') or f'user_{connection_id}'
        print(f"Connected connection ID: {connection_id} with user ID: {user_id}")

        # Send connected event in Web PubSub format with subprotocol info
        connected_event = {
            "type": "system",
            "event": "connected",
            "connectionId": connection_id,
            "userId": user_id,
        }
        if selected_subprotocol:
            connected_event["subprotocol"] = selected_subprotocol
        
        await websocket.send(json.dumps(connected_event))

        room_id = get_room_id(path, 'public')
        print(f"Joining room: {room_id} for connection {connection_id}, user {user_id}")
        await join_group(room_id, connection_id)

        # Handle incoming messages
        async for message in websocket:
            try:
                data = json.loads(message)
                
                # Handle different message types from WebPubSubClient
                if data.get('type') == 'sendToGroup':
                    # Extract message from WebPubSubClient sendToGroup format
                    message_data = data.get('data', {})
                    user_message = message_data.get('message', '') if isinstance(message_data, dict) else str(message_data)
                    user_name = message_data.get('from')
                    group_name = message_data.get('group')
                    print(f'Received message from {user_name} in group {group_name}: {user_message}')
                    
                    # Skip empty messages
                    if not user_message.strip():
                        continue
                    
                    # Add user message to room history
                    add_to_history(group_name, "user", user_name, user_message)
                    
                    # Generate AI response with streaming
                    await handle_ai_response(websocket, room_id, user_message, user_name)
                    
                elif data.get('type') == 'joinGroup':
                    # Handle join group request
                    group_name = data.get('group', room_id)
                    join_group(group_name, connection_id)
                    ack_message = {
                        "type": "ack",
                        "ackId": data.get('ackId', 1),
                        "success": True
                    }
                    await websocket.send(json.dumps(ack_message))
                    print(f"Client joined group: {group_name}")
                    
                elif data.get('type') == 'leaveGroup':
                    # Handle leave group request  
                    group_name = data.get('group', room_id)
                    ack_message = {
                        "type": "ack",
                        "ackId": data.get('ackId', 1),
                        "success": True
                    }
                    await websocket.send(json.dumps(ack_message))
                    print(f"Client left group: {group_name}")
                elif data.get('type') == 'sequenceAck':
                    break
                else:
                    print(f"Unknown message type: {data.get('type')}")
                    
            except json.JSONDecodeError:
                print("Invalid JSON received")
            except Exception as e:
                print(f"Error handling message: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        print("WebSocket connection closed")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        # Cleanup
        if room_id in room_connections:
            room_connections[room_id].discard(websocket)
            if not room_connections[room_id]:  # Remove empty room
                del room_connections[room_id]
        print(f"Client removed. Room {room_id} clients: {len(room_connections.get(room_id, []))}")

async def main():
    """Main server - Flask for HTTP, websockets for WebSocket (separate ports)"""
    
    print(f"Starting dual-server setup:")
    print(f"  Flask HTTP server: http://{host}:{port}")
    print(f"  WebSocket server: ws://{host}:{port + 1}/ws") 
    print("  Subprotocol: json.reliable.webpubsub.azure.v1")
    print("Make sure to build the React client first with: npm run build")
    print("AI Module: Integrated with conversation history")
    
    # Check if AI module is available
    try:
        from ai import get_ai_instance
        ai_instance = get_ai_instance()
        print("✅ AI module loaded successfully")
    except Exception as e:
        print(f"⚠️  AI module error: {e}")
        print("Make sure GITHUB_TOKEN environment variable is set")
    
    print()  # Empty line for better readability
    
    # Start Flask server in a thread
    def run_flask():
        print(f"Flask starting on port {port}")
        app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
    
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # Wait a moment for Flask to start
    await asyncio.sleep(1)
    
    # Start WebSocket server
    print(f"Starting WebSocket server on port {port + 1}")
    websocket_server = await serve(
        websocket_handler,
        host,
        port + 1,  # Use port 5001 for WebSocket
        subprotocols=['json.reliable.webpubsub.azure.v1']
    )
    
    print(f"Both servers running:")
    print(f"  HTTP: http://{host}:{port} (Flask)")
    print(f"  WebSocket: ws://{host}:{port + 1}/ws (websockets)")
    print("Press Ctrl+C to quit")
    
    try:
        await asyncio.Future()  # Run forever
    finally:
        websocket_server.close()
        await websocket_server.wait_closed()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down servers...")
    except Exception as e:
        print(f"Server error: {e}")
        print("Make sure the ports are available.")
