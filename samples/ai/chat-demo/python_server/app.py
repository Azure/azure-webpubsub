"""Flask app and server bootstrap wiring.

Defines the Flask `app`, configures CORS, registers blueprints, and
bootstraps the background asyncio loop + chat service on import so WSGI
hosts can serve immediately after import.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import os
from pathlib import Path
from typing import Any

from flask import Flask, request, send_from_directory, jsonify, Response, abort
from flask_cors import CORS  # type: ignore[import-untyped]
from dotenv import load_dotenv

from .chat_handlers import register_chat_handlers
from .task_manager import ConnectionTaskManager
from .core import build_room_store
from .chat_service.factory import build_chat_service
from .core.runtime_config import resolve_runtime_config
from .core.chat_api import create_chat_api_blueprint

# -----------------------------------------------------
# Background event loop + chat service bootstrap
# -----------------------------------------------------
_init_lock = threading.Lock()
_bootstrap_started = False  # guards against duplicate bootstrap attempts
_ready_event = threading.Event()  # signaled once chat_service + handlers are ready


def _start_background_event_loop() -> None:
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

        def loop_thread() -> None:
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

                async def starter() -> None:
                    try:
                        app.logger.info("Starting chat service...")
                        await cs.start_chat()
                        app.logger.info("Chat service started successfully")
                    except Exception as e:  # noqa: BLE001
                        app.logger.exception("Background chat service failed to start: %s", e)
                loop.create_task(starter())
                loop.run_forever()
            except Exception:
                app.logger.exception("Failed to initialize background event loop")
        t = threading.Thread(target=loop_thread, name="chat-loop", daemon=True)
        t.start()


def wait_until_ready(timeout: float = 5.0) -> None:
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

# Flask app for HTTP endpoints.
app = Flask(__name__)

# -----------------------------------------------------
# Logging configuration (deployment + local friendly)
# -----------------------------------------------------
log_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
log_format = os.getenv("LOG_FORMAT", "%(asctime)s %(levelname)s %(name)s: %(message)s")

if not hasattr(logging, log_level_name):  # fallback if an unknown level is provided
    log_level_name = "INFO"

base_log_level = getattr(logging, log_level_name, logging.INFO)
logging.basicConfig(level=base_log_level, format=log_format, force=True)
app.logger.setLevel(base_log_level)
logging.getLogger("werkzeug").setLevel(base_log_level)
logging.getLogger("openai").setLevel(base_log_level)
logging.getLogger("httpx").setLevel(base_log_level)

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
    "Runtime modes: transport=%s storage=%s (log_level=%s)",
    _runtime.transport.value,
    _runtime.storage.value,
    log_level_name,
)
room_store = build_room_store(app.logger, storage_mode=_runtime.storage)
chat_service: Any | None = None  # will be set by bootstrap thread
event_loop: asyncio.AbstractEventLoop | None = None

# Bootstrap background loop + chat service now
try:
    _start_background_event_loop()
except Exception as e:
    app.logger.exception("Background chat service bootstrap failed during import")

# Register unified chat API blueprint
chat_api_bp = create_chat_api_blueprint(
    room_store_ref=lambda: room_store,
    chat_service_ref=lambda: chat_service,
    event_loop_ref=lambda: event_loop,
)
app.register_blueprint(chat_api_bp)


@app.get('/healthz')
def healthz() -> Any:  # liveness/readiness for container platforms
    return jsonify({"status": "ok"})


@app.get('/readyz')
def readyz() -> Any:
    """Lightweight readiness endpoint with transport/storage info.

    Does not block; reports best-effort readiness based on background bootstrap flag.
    """
    try:
        ready = _ready_event.is_set()
        return jsonify({
            "ready": bool(ready),
            "transport": _runtime.transport.value,
            "storage": _runtime.storage.value,
        })
    except Exception:
        return jsonify({"ready": False}), 200


@app.route('/')
def serve_client() -> Any:
    """Serve the main React app"""
    return send_from_directory(STATIC_DIST, 'index.html')


@app.route('/<path:path>')
def serve_static(path: str) -> Any:
    """Serve static files from React build"""
    return send_from_directory(STATIC_DIST, path)
