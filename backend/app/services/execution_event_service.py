import asyncio
import json
from typing import Any


_subscribers: set[asyncio.Queue[str]] = set()


def subscribe() -> asyncio.Queue[str]:
    queue: asyncio.Queue[str] = asyncio.Queue()
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue[str]) -> None:
    _subscribers.discard(queue)


async def publish(execution: Any) -> None:
    """Publish one execution snapshot to every connected SSE client."""
    payload = json.dumps(execution.model_dump())
    for queue in tuple(_subscribers):
        await queue.put(payload)
