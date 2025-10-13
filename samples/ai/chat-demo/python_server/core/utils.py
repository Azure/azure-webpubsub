"""
Shared utility functions for the chat-demo python server.
"""
import uuid
import asyncio
import threading
from typing import AsyncIterator, Iterable, Optional, TypeVar, Any

T = TypeVar("T")

def generate_id(prefix: str, length: Optional[int] = 8) -> str:
    """Generate a unique identifier with given prefix.

    prefix: Leading token for the ID (e.g. "conn" or "m-")
    length: Number of hex chars from UUID to include (default 8)
    """
    return f"{prefix}_{uuid.uuid4().hex[:length]}"


def get_query_value(path: str, key: str) -> Optional[str]:
    """Extract the value of `key` from a URL path's query string.

    Returns None if key not present or no query string exists.
    """
    if '?' in path:
        query_string = path.split('?', 1)[1]
        pairs = [p.split('=', 1) for p in query_string.split('&') if '=' in p]
        params = {k: v for k, v in pairs}
        return params.get(key)
    return None


def get_room_id(path: str, default_room_id: str) -> str:
    """Return the requested roomId from query string or fallback to default."""
    return get_query_value(path, 'roomId') or default_room_id


async def to_async_iterator(sync_iterable: Iterable[T]) -> AsyncIterator[T]:
    """
    Converts a synchronous iterable into a cancellable, non-blocking
    asynchronous iterator.

    This runs the synchronous iterable in a separate thread to avoid
    blocking the asyncio event loop. If the consumer of the async iterator
    stops early (e.g., through `break` or cancellation), the background
    producer thread is signalled to stop.
    """
    loop = asyncio.get_event_loop()
    queue: "asyncio.Queue[object]" = asyncio.Queue(maxsize=1)
    end_marker: object = object()
    cancel_event = threading.Event()

    def producer() -> None:
        try:
            for item in sync_iterable:
                if cancel_event.is_set():
                    break
                # This is a thread-safe way to call a coroutine from a different
                # thread. It will block here until the item is put in the queue.
                future = asyncio.run_coroutine_threadsafe(queue.put(item), loop)
                future.result()  # Wait for the put() to complete
        except Exception as e:
            # An error occurred in the producer, propagate it to the consumer
            asyncio.run_coroutine_threadsafe(queue.put(e), loop).result()
        finally:
            # Signal the end of the iteration
            asyncio.run_coroutine_threadsafe(queue.put(end_marker), loop).result()

    producer_future = loop.run_in_executor(None, producer)

    try:
        while True:
            item = await queue.get()
            if item is end_marker:
                break
            if isinstance(item, Exception):
                raise item
            yield item
    finally:
        # The consumer has stopped, so signal the producer to exit.
        if not producer_future.done():
            cancel_event.set()
            # The producer might be blocked on `queue.put()`. To unblock it,
            # we can try to remove an item from the queue.
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                # The queue was already empty, which is fine.
                pass
            await producer_future

__all__ = [
    "generate_id",
    "get_query_value",
    "get_room_id",
    "to_async_iterator",
]

