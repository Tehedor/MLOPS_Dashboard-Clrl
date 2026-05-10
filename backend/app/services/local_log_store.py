"""In-memory log store for local runner executions.

Each execution gets a list of log entries and a set of live SSE subscribers.
Entries: {"step": str, "line": str}
Sentinel None marks end-of-stream for subscribers.
"""

import asyncio
from collections import defaultdict

_store:  dict[str, list[dict]] = {}
_queues: dict[str, list[asyncio.Queue]] = defaultdict(list)


def push(execution_id: str, step: str, line: str) -> None:
    if execution_id not in _store:
        _store[execution_id] = []
    entry = {"step": step, "line": line}
    _store[execution_id].append(entry)
    for q in _queues[execution_id]:
        try:
            q.put_nowait(entry)
        except asyncio.QueueFull:
            pass


def get(execution_id: str) -> list[dict]:
    return list(_store.get(execution_id, []))


def subscribe(execution_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=2000)
    _queues[execution_id].append(q)
    return q


def unsubscribe(execution_id: str, q: asyncio.Queue) -> None:
    try:
        _queues[execution_id].remove(q)
    except ValueError:
        pass


def close(execution_id: str) -> None:
    """Send end-of-stream sentinel to all live subscribers."""
    for q in list(_queues[execution_id]):
        try:
            q.put_nowait(None)
        except asyncio.QueueFull:
            pass
    _queues[execution_id].clear()
