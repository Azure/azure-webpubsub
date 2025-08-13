"""Chat demo server.

Modes are now explicit via TRANSPORT_MODE + STORAGE_MODE (see runtime_config.py):
 - TRANSPORT_MODE=self (default): internal websocket server
 - TRANSPORT_MODE=webpubsub: Azure Web PubSub service (client connects directly)

Storage (independent):
 - STORAGE_MODE=memory (default)
 - STORAGE_MODE=table (Azure Table or Azurite)

Azure deployment sets TRANSPORT_MODE=webpubsub and STORAGE_MODE=table automatically; local
dev can mix and match (e.g. self+table using Azurite, or webpubsub+memory).
"""
import asyncio
import threading
import os
from pathlib import Path

from flask import Flask, request, send_from_directory, jsonify, Response, abort
from flask_cors import CORS
from dotenv import load_dotenv

from chat_handlers import register_chat_handlers
from task_manager import ConnectionTaskManager
from core import (
    build_room_store,
    build_chat_service
)
from core.runtime_config import resolve_runtime_config
from core.chat_api import create_chat_api_blueprint

from concurrent.futures import Future

# -----------------------------------------------------
# Background event loop + chat service bootstrap
# -----------------------------------------------------
_init_lock = threading.Lock()
_bootstrap_started = False  # guards against duplicate bootstrap attempts
_ready_event = threading.Event()  # signaled once chat_service + handlers are ready

def _start_background_event_loop():
    """Start (idempotently) the background asyncio loop + chat_service.

    """
    global chat_service, event_loop, _bootstrap_started
    if chat_service is not None:
        return
    with _init_lock:
        if chat_service is not None:
            return
        if _bootstrap_started:
            return
        _bootstrap_started = True

        # Allow an externally reachable websocket base (e.g. reverse proxy, docker mapped port)
        explicit_public_ws = os.getenv("PUBLIC_WS_ENDPOINT")  # e.g. wss://chat.example.com or ws://localhost:3001

        def loop_thread():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                cs = build_chat_service(
                    explicit_public_ws,
                    host,
                    port + 1,
                    room_store,
                    app.logger,
                    flask_app=app,
                    loop=loop,
                    transport_mode=_runtime.transport,
                )
                # Assign globals
                global chat_service, event_loop  # noqa: PLW0603
                chat_service = cs
                event_loop = loop

                # Register handlers (requires chat_service available)
                task_manager = ConnectionTaskManager(loop)
                register_chat_handlers(cs, app.logger, task_manager)
                _ready_event.set()

                async def starter():
                    try:
                        await cs.start_chat()
                    except Exception as e:  # noqa: BLE001
                        app.logger.exception("Background chat service failed to start: %s", e)
                loop.create_task(starter())
                loop.run_forever()
            except Exception:
                app.logger.exception("Failed to initialize background event loop")
        t = threading.Thread(target=loop_thread, name="chat-loop", daemon=True)
        t.start()

def wait_until_ready(timeout: float = 5.0):
    """Block the Flask thread until chat service handlers registered or timeout."""
    if not _ready_event.is_set():
        _ready_event.wait(timeout=timeout)
# Load environment variables from .env file
load_dotenv()

# -----------------------------------------------------
# Configuration (deployment friendly)
# -----------------------------------------------------
# In Azure App Service (or container) a PORT env var is often provided.
# Bind 0.0.0.0 so the container ingress can reach the process.
host = os.getenv("HOST", "localhost")
port = int(os.getenv("PORT", "5000"))

# Static client assets: during azd packaging we copy ../client/dist => python_server/static
_here = Path(__file__).parent.resolve()
_packaged_static = _here / "static"
_dev_dist = (_here.parent / "client" / "dist").resolve()
STATIC_DIST = _packaged_static if _packaged_static.exists() else _dev_dist

## Helpers moved to core.* modules: build_room_store, build_chat_service, azure_mode_enabled, resolve_webpubsub_config

# Flask app for HTTP endpoints.
app = Flask(__name__)

# Development vs Production mode
DEV_MODE = os.getenv("DEV") in ("1", "true", "True") or os.getenv("FLASK_ENV") == "development"

if DEV_MODE:
    # Allow Vite dev server origin and local API origin
    CORS(app, origins=["http://localhost:5173"], supports_credentials=True)
    app.logger.info("CORS enabled for development mode")
else:
    # In production the site is self-contained (same origin). We intentionally do NOT enable wide CORS.
    # If a reverse proxy is used and specific external origins are needed later, they can be added via ALLOWED_ORIGINS.
    allowed = os.getenv("ALLOWED_ORIGINS")
    if allowed:
        origins = [o.strip() for o in allowed.split(",") if o.strip()]
        if origins:
            CORS(app, origins=origins, supports_credentials=True)
            app.logger.info("CORS enabled for explicit origins: %s", origins)

# Globals to access chat service and event loop from Flask thread
try:
    _runtime = resolve_runtime_config()
except Exception as e:
    raise SystemExit(f"Runtime configuration error: {e}")
app.logger.info(
    "Runtime modes: transport=%s storage=%s",
    _runtime.transport.value,
    _runtime.storage.value,
)
room_store = build_room_store(app.logger, storage_mode=_runtime.storage)
chat_service = None  # will be set by bootstrap thread
event_loop = None  # type: ignore[assignment]

# Bootstrap background loop + chat service now
try:
    _start_background_event_loop()
except Exception:
    app.logger.exception("Background chat service bootstrap failed during import")

# Register unified chat API blueprint using unified room_store (metadata + messages)
chat_api_bp = create_chat_api_blueprint(
    room_store_ref=lambda: room_store,
    chat_service_ref=lambda: chat_service,
    event_loop_ref=lambda: event_loop,
)
app.register_blueprint(chat_api_bp)

@app.route('/negotiate')
def negotiate():
    """Negotiate client connection endpoint.

    Azure mode -> returns service client access URL from Web PubSub service.
    Self host  -> returns local WebSocket endpoint URL.
    """
    wait_until_ready()
    global chat_service
    try:
        return chat_service.negotiate()
    except Exception as e:  # noqa: BLE001
        app.logger.exception("Negotiation failed: %s", e)
        return (str(e), 500)

@app.get('/healthz')
def healthz():  # liveness/readiness for container platforms
    return jsonify({"status": "ok"})
    
@app.route('/')
def serve_client():
    """Serve the main React app"""
    return send_from_directory(STATIC_DIST, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from React build"""
    return send_from_directory(STATIC_DIST, path)

async def main():
    """Entry point for local development.

    Only responsible for starting the Flask HTTP server; chat service is
    bootstrapped lazily (and immediately) via ensure_chat_service_initialized.
    """
    app.logger.info("Flask HTTP server binding on %s:%s", host, port)
    app.logger.info("Subprotocol: json.reliable.webpubsub.azure.v1")
    app.logger.info("Make sure to build the React client first with: npm run build")

    def run_flask():
        app.logger.info("Flask starting on %s:%s (static=%s)", host, port, STATIC_DIST)
        app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)

    # Chat service already bootstrapped at import; just ensure ready (best-effort)
    wait_until_ready()

    # Start Flask (blocking in separate thread so asyncio future can wait)
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    app.logger.info("HTTP: http://%s:%s (Flask)", host, port)
    app.logger.info("Press Ctrl+C to quit")
    try:
        await asyncio.Future()
    finally:
        # Best-effort graceful shutdown if loop still alive
        if event_loop and event_loop.is_running() and chat_service:
            try:
                fut = asyncio.run_coroutine_threadsafe(chat_service.stop(), event_loop)
                fut.result(timeout=5)
            except Exception:
                pass

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        app.logger.info("Shutting down servers...")
    except Exception as e:
        app.logger.exception("Server error: %s", e)
        app.logger.error("Make sure the ports are available.")
