"""Chat demo server.

Modes:
 - Self-host (default): InMemoryRoomStore + internal WS server
 - Azure (AZURE=true): AzureRoomStore + Azure Web PubSub (endpoint or connection string)

Minimal environment for Azure mode:
    AZURE=true
    WEBPUBSUB_CONNECTION_STRING=... (or WEBPUBSUB_ENDPOINT + credential chain)
    AZURE_STORAGE_CONNECTION_STRING=... (injected by infra)
"""
from flask import Flask, request, send_from_directory, jsonify
from flask_cors import CORS
import os
import asyncio
import threading
from dotenv import load_dotenv
from chat_model_client import chat_stream  # Import our AI module
from chat_service import ChatService, ChatServiceBase, ClientConnectionContext, WebPubSubChatService, as_room_group, SYS_ROOMS_GROUP
from client_manager import InMemoryClientManager
from room_store import InMemoryRoomStore, AzureRoomStore
try:
    from client_manager import AzureStorageClientManager
except Exception:
    AzureStorageClientManager = None  # type: ignore
from utils import get_room_id, to_async_iterator

from concurrent.futures import Future
# Load environment variables from .env file
load_dotenv()

# Configuration
host = "localhost"
port = 5000

# Flask app for HTTP endpoints
app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "http://localhost:3000"])

# Globals to access chat service and event loop from Flask thread
chat_service = None  # type: ignore[assignment]
event_loop = None  # type: ignore[assignment]
@app.route('/negotiate')
def negotiate():
    """Handle negotiation requests.

    - In self-host mode, returns local WS URL.
    - In webpubsub mode, returns a client access URL from the Azure service.
    """
    global chat_service
    azure_mode = os.getenv("AZURE", "false").lower() in ("1", "true", "yes", "on")

    if isinstance(chat_service, WebPubSubChatService) or azure_mode:
        # Include initial group memberships: the room and the sys rooms channel
        try:
            if isinstance(chat_service, WebPubSubChatService):
                svc = chat_service
            else:
                # Create a temporary service client for negotiation if not yet initialized
                endpoint = os.getenv("WEBPUBSUB_ENDPOINT") or os.getenv("WEB_PUBSUB_ENDPOINT")
                conn_str = os.getenv("WEBPUBSUB_CONNECTION_STRING") or os.getenv("WEB_PUBSUB_CONNECTION_STRING")
                hub = os.getenv("WEBPUBSUB_HUB", "chat")
                if endpoint:
                    svc = WebPubSubChatService(endpoint=endpoint, hub=hub)
                elif conn_str:
                    svc = WebPubSubChatService(connection_string=conn_str, hub=hub)
                else:
                    raise RuntimeError("WEBPUBSUB_ENDPOINT or WEBPUBSUB_CONNECTION_STRING is required for WebPubSub negotiation")
            url = svc.get_client_access_url()
            return url
        except Exception as e:  # noqa: BLE001
            app.logger.exception("Negotiation failed: %s", e)
            return (str(e), 500)
    # Self-host fallback
    ws_url = f"ws://{host}:{port + 1}/ws"
    return ws_url

@app.get('/api/rooms')
def api_list_rooms():
    global chat_service, event_loop
    if chat_service is None or event_loop is None:
        return jsonify({"rooms": []}), 503
    try:
        fut = asyncio.run_coroutine_threadsafe(chat_service.room_store.list_rooms(), event_loop)  # type: ignore[arg-type]
        rooms = fut.result(timeout=5)
        return jsonify({"rooms": rooms})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.get('/api/rooms/<room_id>/messages')
def api_room_messages(room_id: str):
    global chat_service, event_loop
    if chat_service is None or event_loop is None:
        return jsonify({"messages": []}), 503
    try:
        try:
            limit = int(request.args.get('limit', '200'))
        except Exception:
            limit = 200
        fut = asyncio.run_coroutine_threadsafe(
            chat_service.room_store.get_room_messages(room_id, limit),
            event_loop,
        )  # type: ignore[arg-type]
        messages = fut.result(timeout=5)
        return jsonify({"messages": messages})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def serve_client():
    """Serve the main React app"""
    return send_from_directory('../client/dist', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from React build"""
    return send_from_directory('../client/dist', path)

async def main():
    """Chat server"""
    
    app.logger.info("  Flask HTTP server: http://%s:%s", host, port)
    app.logger.info("  Subprotocol: json.reliable.webpubsub.azure.v1")
    app.logger.info("Make sure to build the React client first with: npm run build")
    app.logger.info("AI Module: Integrated with conversation history")
    
    # Check if AI module is available
    try:
        from ai import get_ai_instance
        ai_instance = get_ai_instance()
        app.logger.info("AI module loaded successfully")
    except Exception as e:
        app.logger.warning("AI module error: %s", e)
        app.logger.warning("Make sure GITHUB_TOKEN environment variable is set")
    
    # Start Flask server in a thread
    def run_flask():
        app.logger.info("Flask starting on port %s", port)
        app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
    

    # Mode selection: self-host (default) or Azure mode (AZURE=true)
    azure_mode = os.getenv("AZURE", "false").lower() in ("1", "true", "yes", "on")
    if azure_mode and AzureStorageClientManager is not None:
        try:
            client_manager = AzureStorageClientManager()
            room_store = AzureRoomStore()
            app.logger.info("Mode: AZURE (Web PubSub + AzureRoomStore)")
        except Exception as e:  # noqa: BLE001
            app.logger.warning("Azure storage init failed (%s); falling back to in-memory store", e)
            client_manager = InMemoryClientManager()
            room_store = InMemoryRoomStore()
    else:
        if azure_mode and AzureStorageClientManager is None:
            app.logger.warning("AZURE=true but azure storage libs not available; using in-memory mode")
        client_manager = InMemoryClientManager()
        room_store = InMemoryRoomStore()
        if not azure_mode:
            app.logger.info("Mode: SELF-HOST (in-memory store)")

    # Choose transport: self-host or Azure Web PubSub
    if azure_mode:
        endpoint = os.getenv("WEBPUBSUB_ENDPOINT") or os.getenv("WEB_PUBSUB_ENDPOINT")
        conn_str = os.getenv("WEBPUBSUB_CONNECTION_STRING") or os.getenv("WEB_PUBSUB_CONNECTION_STRING")
        hub = os.getenv("WEBPUBSUB_HUB", "chat")
        if endpoint:
            chat = WebPubSubChatService(endpoint=endpoint, hub=hub, room_store=room_store)
            app.logger.info("Using Azure Web PubSub service transport (endpoint + DefaultAzureCredential)")
        elif conn_str:
            chat = WebPubSubChatService(connection_string=conn_str, hub=hub, room_store=room_store)
            app.logger.info("Using Azure Web PubSub service transport (connection string)")
        else:
            app.logger.warning("AZURE=true but WEBPUBSUB_ENDPOINT or WEBPUBSUB_CONNECTION_STRING not provided; falling back to selfhost transport")
            chat = ChatService(client_manager=client_manager, room_store=room_store)
    else:
        chat = ChatService(client_manager=client_manager, room_store=room_store)
    # expose chat and loop to Flask handlers
    global chat_service, event_loop
    chat_service = chat
    event_loop = asyncio.get_running_loop()

    # ---------------- HTTP Event Handler Bridge (Azure mode) ----------------
    if azure_mode and isinstance(chat, WebPubSubChatService):
        chat.attach_flask_cloudevents(app, event_loop)
        
    @chat.on_connecting
    async def handle_connecting(conn: ClientConnectionContext, _svc: ChatService):
        # Set the userId as "You"
        # UserID can be set When Auth middleware is added
        conn.user_id = "You"
    @chat.on_connected
    async def handle_connected(conn: ClientConnectionContext, _svc: ChatService):
        # get roomId from path roomId
        room_id = get_room_id(conn.query, "public")
        if room_id:
            await _svc.add_to_group(conn.connectionId, room_id)
            app.logger.info("Client connected to room: %s", room_id)
        # Track background tasks per connection for cleanup
        conn.attrs.setdefault("tasks", set())
        app.logger.info("connected: %s user=%s", conn.connectionId, conn.user_id)

    @chat.on_event_message
    async def handle_event_message(conn, event_name, data, _svc: ChatServiceBase):
        print("handle event message",event_name, data)
        if event_name == "sendToAI":
            message = data.get("message")
            room_id = data.get("roomId")
            app.logger.info("Received message for AI: %s in room %s", message, room_id)
            if message is not None and room_id is not None:
                # also broadcast to others about this message
                await _svc.send_to_group(room_id, message, [conn.connectionId], conn.user_id)
                # Build conversation history from this room and pass to AI
                try:
                    history_events = await _svc.room_store.get_room_messages(room_id)
                except Exception:
                    history_events = []
                conversation_history = []
                for ev in history_events:
                    try:
                        if ev.get("type") != "message":
                            continue
                        content = ev.get("message")
                        if not isinstance(content, str) or not content:
                            continue
                        # Treat events without a 'from' (AI responses) as assistant; others as user
                        role = "assistant" if ev.get("from") in (None, "AI", "AI Assistant", "assistant") else "user"
                        conversation_history.append({"role": role, "content": content})
                    except Exception:
                        continue
                # Avoid duplicating the just-sent user message: drop the last entry if it matches
                if conversation_history and conversation_history[-1]["role"] == "user" and conversation_history[-1]["content"] == message:
                    conversation_history.pop()
                # Start AI streaming in background so multiple requests can stream concurrently
                app.logger.debug("Sending to AI with history (%d items)", len(conversation_history))
                chunks = chat_stream(message, conversation_history=conversation_history)
                app.logger.debug("Starting AI stream task to room %s (scheduled on main loop)", room_id)
                # Ensure we capture the main loop stored earlier
                global event_loop
                async_chunks = to_async_iterator(chunks)
                coro = _svc.streaming_to_group(room_id, async_chunks)
                # Schedule on main loop even though this handler runs in Flask thread
                future: Future = asyncio.run_coroutine_threadsafe(coro, event_loop)
                try:
                    tasks = conn.attrs.setdefault("tasks", set())
                    tasks.add(future)
                    def _cleanup(_fut):
                        try:
                            tasks.discard(future)
                        except Exception:
                            pass
                    future.add_done_callback(_cleanup)
                except Exception:
                    pass

    @chat.on_disconnected
    async def handle_disconnected(conn, _svc):
        # Cancel any background tasks for this connection (e.g., in-flight AI streams)
        tasks = conn.attrs.get("tasks") or set()
        for t in list(tasks):
            try:
                # t may be an asyncio.Task or a concurrent.futures.Future
                if hasattr(t, 'cancel'):
                    t.cancel()
            except Exception:
                pass
        app.logger.info("Client disconnected: %s", conn.connectionId)

    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # Wait a moment for Flask to start
    await asyncio.sleep(1)

    # Start chat service
    app.logger.info("Starting chat service")
    
    await chat.start_chat(host, port + 1)

    app.logger.info("  HTTP: http://%s:%s (Flask)", host, port)
    app.logger.info("Press Ctrl+C to quit")
    
    try:
        await asyncio.Future()  # Run forever
    finally:
        await chat.stop()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        app.logger.info("Shutting down servers...")
    except Exception as e:
        app.logger.exception("Server error: %s", e)
        app.logger.error("Make sure the ports are available.")
