from __future__ import annotations

import asyncio
import threading
from typing import Any

from .app import app, host, port, event_loop, chat_service, wait_until_ready


async def main() -> None:
    """Entry point for local development.

    Starts the Flask HTTP server; chat service is bootstrapped lazily via
    the import side effects in python_server.app.
    """
    app.logger.info("Flask HTTP server binding on %s:%s", host, port)
    app.logger.info("Subprotocol: json.reliable.webpubsub.azure.v1")
    app.logger.info("Make sure to build the React client first with: npm run build")

    def run_flask() -> None:
        app.logger.info("Flask starting on %s:%s", host, port)
        app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)

    # Ensure background chat service is ready (best-effort)
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


if __name__ == '__main__':  # pragma: no cover
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        app.logger.info("Shutting down servers...")
    except Exception as e:  # noqa: BLE001
        app.logger.exception("Server error: %s", e)
        app.logger.error("Make sure the ports are available.")

