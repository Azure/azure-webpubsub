"""Unified chat API blueprint: room metadata CRUD + message history.

This consolidates previous room_api + server inline message routes.
"""
from __future__ import annotations

from flask import Blueprint, request, jsonify, url_for
from typing import Optional, Any, Callable, Awaitable, TypeVar, Coroutine
import asyncio
import logging

logger = logging.getLogger(__name__)

# Reasonable defaults for async marshalling and paging
DEFAULT_TIMEOUT_SEC: float = 5.0
MAX_MESSAGES_LIMIT: int = 500

T = TypeVar("T")

def create_chat_api_blueprint(
    room_store_ref: Optional[Callable[[], Any]] | Any = None,
    *,
    chat_service_ref: Optional[Callable[[], Any]] | Any = None,
    event_loop_ref: Optional[Callable[[], Any]] | Any = None,
) -> Blueprint:
    """Factory for chat API blueprint.

    room_store_ref: callable returning unified RoomStore (with metadata + messages) or direct object
    chat_service_ref: callable returning chat_service (to avoid circular import) or direct object
    event_loop_ref: callable returning event loop used by chat service or direct object
    """
    bp = Blueprint('chat_api', __name__)

    def _get_user_id() -> str:
        user_id = request.headers.get('X-User-Id', '').strip() or 'anonymous'
        return user_id

    def _get_chat_service() -> Any:
        svc = chat_service_ref() if callable(chat_service_ref) else chat_service_ref
        return svc

    def _get_loop() -> Any:
        loop = event_loop_ref() if callable(event_loop_ref) else event_loop_ref
        return loop

    def _get_room_store() -> Any:
        rs = room_store_ref() if callable(room_store_ref) else room_store_ref
        return rs

    # ---------------- Common helpers ----------------
    def run_async(coro: Coroutine[Any, Any, T], *, timeout: Optional[float] = DEFAULT_TIMEOUT_SEC, allow_direct: bool = True) -> T:
        """Execute *coro* on the dedicated chat event loop.

        Rationale: the chat service + room store operate on a long-lived
        background event loop (created in server bootstrap). Flask itself
        runs in synchronous threads. To keep room store state single-threaded
        and avoid cross-loop issues, all async store/service calls are marshalled
        onto that loop. In unit tests (no running loop) we fall back to a direct
        asyncio.run for simplicity.
        """
        loop = _get_loop()
        if loop is None or not getattr(loop, 'is_running', lambda: False)():
            if not allow_direct:
                raise RuntimeError("Chat event loop not available")
            return asyncio.run(coro)
        fut = asyncio.run_coroutine_threadsafe(coro, loop)
        try:
            return fut.result(timeout=timeout) if timeout else fut.result()
        except Exception as e:  # noqa: BLE001
            logger.warning("run_async error (timeout=%s): %s", timeout, e)
            raise

    # Field normalization extracted so routes stay lean.
    def normalize_room_name(raw: Any) -> Optional[str]:
        if raw is None:
            return None
        s = str(raw).strip()
        return s or None

    def normalize_description(payload: dict[str, Any]) -> Optional[str]:
        if 'description' not in payload:
            return None  # no change
        raw = payload.get('description')
        if raw == '':
            return ''  # explicit clear
        if raw is None:
            return None
        s = str(raw).strip()
        return s or None  # whitespace-only -> no change

    def parse_int(value: Optional[str], default: int) -> int:
        try:
            return int(value) if value is not None else default
        except Exception:
            return default

    # Response helpers for consistency
    def json_ok(payload: dict[str, Any], status: int = 200) -> Any:
        return jsonify(payload), status

    def json_error(message: str, status: int) -> Any:
        return jsonify({'error': message}), status

    # -------- Room metadata endpoints (async via unified store) --------
    @bp.route('/api/rooms', methods=['GET'])
    def list_rooms() -> Any:
        try:
            user_id = _get_user_id()
            store = _get_room_store()
            if store is None:
                return json_error('Store unavailable', 503)
            rooms = run_async(store.list_user_rooms(user_id))
            return json_ok({'rooms': [r.to_dict() for r in rooms], 'user_id': user_id})
        except Exception as e:  # noqa: BLE001
            logger.error("Error getting rooms: %s", e)
            return json_error('Failed to get rooms', 500)

    @bp.route('/api/rooms', methods=['POST'])
    def create_room() -> Any:
        try:
            user_id = _get_user_id()
            data = request.get_json(silent=True)
            if not data:
                return json_error('Request body required', 400)
            room_name = (data.get('roomName') or '').strip()
            if not room_name:
                return json_error('roomName is required', 400)
            # Explicit roomId creation is no longer allowed; always auto-generate
            if 'roomId' in data and data.get('roomId'):
                return json_error('Explicit roomId not allowed; omit roomId to create', 400)
            room_id = None
            description = (data.get('description') or '').strip() or None
            store = _get_room_store()
            if store is None:
                return json_error('Store unavailable', 503)
            room = run_async(store.create_room_metadata(user_id, room_name, room_id=room_id, description=description))
            body = room.to_dict()
            try:
                location = url_for('chat_api.get_room', room_id=room.room_id, _external=False)
                return jsonify(body), 201, {"Location": location}
            except Exception:
                return jsonify(body), 201
        except ValueError as e:  # fallback validation
            return json_error(str(e), 400)
        except Exception as e:  # noqa: BLE001
            logger.error("Error creating room: %s", e)
            return json_error('Failed to create room', 500)

    @bp.route('/api/rooms/<room_id>', methods=['GET'])
    def get_room(room_id: str) -> Any:
        try:
            user_id = _get_user_id()
            store = _get_room_store()
            if store is None:
                return json_error('Store unavailable', 503)
            room = run_async(store.get_room_metadata(user_id, room_id))
            if room is None:
                return json_error('Room not found', 404)
            return json_ok(room.to_dict())
        except Exception as e:  # noqa: BLE001
            logger.error("Error getting room %s: %s", room_id, e)
            return json_error('Failed to get room', 500)

    @bp.route('/api/rooms/<room_id>', methods=['PUT'])
    def update_room(room_id: str) -> Any:
        try:
            user_id = _get_user_id()
            store = _get_room_store()
            if store is None:
                return json_error('Store unavailable', 503)
            existing = run_async(store.get_room_metadata(user_id, room_id))
            if existing is None:
                return json_error('Room not found', 404)
            if room_id == 'public':
                return json_error('Cannot update system room', 403)
            data = request.get_json(silent=True)
            if not data:
                return json_error('Request body required', 400)
            room_name = normalize_room_name(data.get('roomName'))
            description = normalize_description(data)
            updated = run_async(store.update_room_metadata(
                user_id,
                room_id,
                room_name=room_name,
                description=description,
            ))
            return json_ok(updated.to_dict())
        except Exception as e:  # noqa: BLE001
            logger.error("Error updating room %s: %s", room_id, e)
            return json_error('Failed to update room', 500)

    @bp.route('/api/rooms/<room_id>', methods=['DELETE'])
    def delete_room(room_id: str) -> Any:
        try:
            user_id = _get_user_id()
            if room_id == 'public':
                return jsonify({'error': 'Cannot delete system room'}), 403
            store = _get_room_store()
            if store is None:
                return json_error('Store unavailable', 503)
            # Idempotent delete: attempt removal; success response even if not present
            run_async(store.delete_room_metadata(user_id, room_id))
            return json_ok({'message': 'Room deleted (idempotent)'})
        except Exception as e:  # noqa: BLE001
            logger.error("Error deleting room %s: %s", room_id, e)
            return json_error('Failed to delete room', 500)

    # -------- Conversation / messages endpoint --------
    @bp.route('/api/rooms/<room_id>/messages', methods=['GET'])
    def get_room_messages(room_id: str) -> Any:
        """Return recent messages for a room (uses async room_store via chat_service)."""
        svc = _get_chat_service()
        if svc is None:
            return json_error('Service unavailable', 503)
        try:
            limit = parse_int(request.args.get('limit'), 200)
            # Clamp to a safe maximum to avoid excessive loads
            if limit is None or limit < 0:
                limit = 200
            limit = min(limit, MAX_MESSAGES_LIMIT)
            from concurrent.futures import TimeoutError as FuturesTimeoutError
            try:
                messages = run_async(svc.room_store.get_room_messages(room_id, limit), timeout=2)
                return json_ok({'messages': messages})
            except FuturesTimeoutError:
                logger.warning("Timeout retrieving messages for room %s", room_id)
                return json_error('Message retrieval timed out', 504)
            except Exception as e:  # noqa: BLE001
                logger.exception("Error retrieving messages for room %s: %s", room_id, e)
                return json_error('Failed to retrieve messages', 500)
        except Exception as e:  # noqa: BLE001
            logger.exception("Unexpected error fetching messages for %s: %s", room_id, e)
            return json_error('Failed to retrieve messages', 500)

    # -------- Negotiate endpoint --------
    @bp.route('/api/negotiate', methods=['GET'])
    def negotiate() -> Any:
        """Return a client connection URL as JSON: {"url": string}.

        Self-host mode: ws://.../ws
        Web PubSub mode: signed client access URL
        """
        svc = _get_chat_service()
        if svc is None:
            return json_error('Service unavailable', 503)
        try:
            url = svc.negotiate()
            return jsonify({"url": url})
        except Exception as e:  # noqa: BLE001
            logger.exception('Negotiation failed: %s', e)
            return json_error('Negotiation failed', 500)

    return bp

__all__ = ["create_chat_api_blueprint"]
