import asyncio

class TaskExtensions:
    @staticmethod
    async def or_timeout(task, milliseconds_delay=5000):
        try:
            await asyncio.wait_for(task, timeout=milliseconds_delay / 1000)
        except asyncio.TimeoutError:
            raise TimeoutError()
