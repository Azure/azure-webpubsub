"""Chat event handler registration.

This module encapsulates the chat-specific event handlers and per-connection
background task management so that `server.py` can stay focused on process
startup / wiring.
"""
from __future__ import annotations

from core import (
    ClientConnectionContext,
    ChatServiceBase,
    chat_stream,
    to_async_iterator,
    get_room_id
)
from task_manager import ConnectionTaskManager

def register_chat_handlers(chat: ChatServiceBase, app_logger, task_manager: ConnectionTaskManager):  # noqa: D401
    """Attach all chat event handlers to the provided chat service.

    Parameters
    ----------
    chat: ChatServiceBase
        The chat service instance (self-host or Web PubSub based) whose decorator
        methods we use to register handlers.
    app_logger:
        Logger for emitting diagnostic information.
    room_store:
        Provided for future customization (currently accessed via chat.room_store).
    task_manager: ConnectionTaskManager
        Manages scheduling and cancellation of background tasks per connectionId.
    """

    # Maintain a per-connection set of background tasks for cleanup.
    def cancel_conn_tasks(conn: ClientConnectionContext) -> None:
        if conn.connectionId:
            task_manager.cancel_all(conn.connectionId)

    @chat.on_connecting
    async def handle_connecting(conn: ClientConnectionContext, _svc: ChatServiceBase):  # noqa: D401
        # Placeholder for future auth hook
        conn.user_id = "You"

    @chat.on_connected
    async def handle_connected(conn: ClientConnectionContext, _svc: ChatServiceBase):  # noqa: D401
        room_id = get_room_id(conn.query, "public")
        if room_id:
            await _svc.add_to_group(conn.connectionId, room_id)
            app_logger.info("Client connected to room: %s", room_id)
        app_logger.info("connected: %s user=%s", conn.connectionId, conn.user_id)

    @chat.on_event_message
    async def handle_event_message(conn, event_name, data, _svc: ChatServiceBase):  # noqa: D401
        if event_name == "sendToAI":
            message = data.get("message")
            room_id = data.get("roomId")
            app_logger.info("Received message for AI: %s in room %s", message, room_id)
            if message is not None and room_id is not None:
                # Broadcast user message first
                await _svc.send_to_group(room_id, message, [conn.connectionId], conn.user_id)
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
                        role = "assistant" if ev.get("from") in (None, "AI", "AI Assistant", "assistant") else "user"
                        conversation_history.append({"role": role, "content": content})
                    except Exception:  # pragma: no cover
                        continue
                if conversation_history and conversation_history[-1]["role"] == "user" and conversation_history[-1]["content"] == message:
                    conversation_history.pop()
                app_logger.debug("Sending to AI with history (%d items)", len(conversation_history))
                chunks = chat_stream(message, conversation_history=conversation_history)
                app_logger.debug("Starting AI stream task to room %s (scheduled on main loop)", room_id)
                coro = _svc.streaming_to_group(room_id, to_async_iterator(chunks))
                task_manager.schedule(conn.connectionId, coro)

    @chat.on_disconnected
    async def handle_disconnected(conn, _svc):  # noqa: D401
        cancel_conn_tasks(conn)
        app_logger.info("Client disconnected: %s", conn.connectionId)
