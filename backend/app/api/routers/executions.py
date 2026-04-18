import json
import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.execution import Execution, ExecutionCreate
from app.services.execution_service import ExecutionService

router = APIRouter()
_service = ExecutionService()
_sse_queues: list[asyncio.Queue] = []


@router.post("", response_model=Execution, status_code=201)
async def create_execution(body: ExecutionCreate):
    ex = await _service.create(body)
    await _broadcast(ex)
    return ex


@router.get("", response_model=list[Execution])
async def list_executions():
    return await _service.list_all()


@router.get("/stream")
async def stream_executions():
    q: asyncio.Queue = asyncio.Queue()
    _sse_queues.append(q)

    async def generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                data = await q.get()
                yield f"data: {data}\n\n"
        except asyncio.CancelledError:
            if q in _sse_queues:
                _sse_queues.remove(q)

    return StreamingResponse(generator(), media_type="text/event-stream")


@router.get("/{execution_id}", response_model=Execution)
async def get_execution(execution_id: str):
    ex = await _service.get(execution_id)
    if not ex:
        raise HTTPException(404, "Execution not found")
    return ex


@router.post("/{execution_id}/cancel", response_model=Execution)
async def cancel_execution(execution_id: str):
    ex = await _service.cancel(execution_id)
    await _broadcast(ex)
    return ex


@router.post("/{execution_id}/retry", response_model=Execution)
async def retry_execution(execution_id: str):
    ex = await _service.retry(execution_id)
    await _broadcast(ex)
    return ex


async def _broadcast(execution: Execution) -> None:
    payload = json.dumps(execution.model_dump())
    for q in _sse_queues:
        await q.put(payload)
