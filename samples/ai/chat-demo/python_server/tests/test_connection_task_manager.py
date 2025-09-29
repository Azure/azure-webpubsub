import asyncio
import threading
import pytest
from python_server.task_manager import ConnectionTaskManager

@pytest.mark.asyncio
async def test_schedule_and_cancel_all():
    loop = asyncio.new_event_loop()
    t = threading.Thread(target=lambda: (asyncio.set_event_loop(loop), loop.run_forever()), daemon=True)
    t.start()
    mgr = ConnectionTaskManager(loop)
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def worker():
        started.set()
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:  # pragma: no cover
            cancelled.set()
            raise

    fut = mgr.schedule("c1", worker())
    await asyncio.wait_for(started.wait(), timeout=2)
    assert mgr.active_count("c1") == 1

    mgr.cancel_all("c1")
    try:
        await asyncio.wait_for(asyncio.wrap_future(fut), timeout=2)
    except asyncio.CancelledError:
        pass
    assert cancelled.is_set() or fut.cancelled()
    assert mgr.active_count("c1") == 0

    loop.call_soon_threadsafe(loop.stop)
    t.join(timeout=2)
    loop.close()
