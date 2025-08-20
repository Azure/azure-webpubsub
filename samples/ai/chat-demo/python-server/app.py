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
from chat_service import ChatService
from utils import get_room_id, to_async_iterator
# Load environment variables from .env file
load_dotenv()

# Configuration
host = "localhost"
port = 5000

# Flask app for HTTP endpoints
app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000"])
@app.route('/negotiate')
def negotiate():
    """Handle negotiation requests - return WebSocket URL"""
    room_id = request.args.get('roomId', 'public')
    print(f"Negotiation request for room: {room_id}")
    
    # Return WebSocket URL using WebSocket port
    ws_url = f"ws://{host}:{port + 1}/ws?roomId={room_id}"
    return ws_url

@app.route('/')
def serve_client():
    """Serve the main React app"""
    return send_from_directory('../client/dist', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from React build"""
    return send_from_directory('../client/dist', path)

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

    # Start chat service
    print(f"Starting chat service on port {port + 1}")
    
    chat = ChatService()

    @chat.on_connected
    async def handle_connected(conn, _svc: ChatService):
        # get roomId from path roomId
        room_id = get_room_id(conn.path, "public-room")
        if room_id:
            await _svc.add_to_group(conn.connectionId, room_id)
            print(f"Client connected to room: {room_id}")
        print("connected:", conn.connectionId)

    @chat.on_event_message
    async def handle_event_message(conn, event_name, data, _svc: ChatService):
        if event_name == "sendToAI":
            message = data.get("message")
            room_id = data.get("roomId")
            print(f"Received message for AI: {message} in room {room_id}")
            if message is not None and room_id is not None:
                chunks = chat_stream(message)
                await _svc.streaming_to_group(room_id, to_async_iterator(chunks))

    @chat.on_disconnected
    async def handle_disconnected(conn, _svc):
        print(f"Client disconnected: {conn.connectionId}")
    await chat.start_chat(host, port + 1)

    print(f"Both servers running:")
    print(f"  HTTP: http://{host}:{port} (Flask)")
    print(f"  WebSocket: ws://{host}:{port + 1}/ws (websockets)")
    print("Press Ctrl+C to quit")
    
    try:
        await asyncio.Future()  # Run forever
    finally:
        await chat.close()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down servers...")
    except Exception as e:
        print(f"Server error: {e}")
        print("Make sure the ports are available.")
