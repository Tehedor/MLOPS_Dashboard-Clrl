import json
import asyncio
from typing import AsyncGenerator

import yaml
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.core.config import phases_runner_path
from app.schemas.execution import Execution, ExecutionCreate
from app.services.execution_service import ExecutionService
from app.services.github import fetch_run_logs

router = APIRouter()
_service = ExecutionService()
_sse_queues: list[asyncio.Queue] = []


def _fase_label(fase_id: str) -> str:
    parts = fase_id.split('_')
    return ' '.join(p.capitalize() for p in parts)


def _parse_runner_map(config: dict) -> dict:
    """Devuelve {runner_name: runner_json} para fromJSON(inputs.runner) de GHA."""
    result = {}
    for item in config.get("runners", []):
        name = next((k for k in item if k not in ('max-parallel', 'labels')), None)
        if not name:
            continue
        labels = item.get("labels", [])
        result[name] = json.dumps(labels[0] if len(labels) == 1 else labels)
    return result


def _split_runner_field(runner_str: str) -> list[str]:
    """Split CSV de runners respetando arrays JSON literales como ["a","b"]."""
    result, current, depth = [], [], 0
    for ch in runner_str:
        if ch == '[':
            depth += 1
            current.append(ch)
        elif ch == ']':
            depth -= 1
            current.append(ch)
        elif ch == ',' and depth == 0:
            token = ''.join(current).strip()
            if token:
                result.append(token)
            current = []
        else:
            current.append(ch)
    token = ''.join(current).strip()
    if token:
        result.append(token)
    return result


def _runner_json(name: str, runner_map: dict) -> str:
    """Devuelve el runner_json para un nombre de runner o un array JSON literal."""
    if name.strip().startswith('['):
        return name.strip()  # ya es un JSON array válido para fromJSON()
    return runner_map.get(name, json.dumps(name))


def _load_phases() -> list[dict]:
    config_path = phases_runner_path()
    with open(config_path) as f:
        config = yaml.safe_load(f)
    runner_map = _parse_runner_map(config)
    result = []
    for fase in config.get("fases", []):
        entry = dict(fase)
        entry.setdefault('label', _fase_label(entry['fase']))
        runner_names = _split_runner_field(str(entry.get('runner', '')))
        entry['available_runners'] = [
            {'id': n, 'runner_json': _runner_json(n, runner_map)}
            for n in runner_names
        ]
        result.append(entry)
    return result


@router.get("/phases")
async def get_phases():
    return _load_phases()


@router.get("/queue/status")
async def get_queue_status():
    return {"paused": _service._paused}


@router.post("/queue/pause")
async def pause_queue():
    _service._paused = True
    return {"paused": True}


@router.post("/queue/resume")
async def resume_queue():
    _service._paused = False
    return {"paused": False}


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


@router.get("/gh-logs/{gh_run_id}")
async def get_gh_logs(gh_run_id: str):
    logs = await fetch_run_logs(gh_run_id)
    if not logs:
        raise HTTPException(404, "No logs found or GitHub token not configured")
    return logs


@router.get("/{execution_id}/local-logs")
async def get_local_logs(execution_id: str):
    from app.services.local_log_store import get as get_logs
    return get_logs(execution_id)


@router.get("/{execution_id}/local-logs/stream")
async def stream_local_logs(execution_id: str):
    from app.services.local_log_store import subscribe, unsubscribe, get as get_logs

    _TERMINAL = {"success", "failed", "canceled"}
    ex = await _service.get(execution_id)
    already_done = ex is None or ex.status.value in _TERMINAL

    q = subscribe(execution_id)
    past = get_logs(execution_id)

    async def generator() -> AsyncGenerator[str, None]:
        # Replay buffered lines
        for entry in past:
            yield f"data: {json.dumps(entry)}\n\n"
        # If execution already finished, close immediately
        if already_done:
            unsubscribe(execution_id, q)
            if not past:
                yield f"data: {json.dumps({'step': 'info', 'line': '[sin logs — el backend fue reiniciado o la ejecución falló antes de arrancar]'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return
        # Live stream until sentinel
        try:
            while True:
                item = await q.get()
                if item is None:
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    break
                yield f"data: {json.dumps(item)}\n\n"
        except asyncio.CancelledError:
            unsubscribe(execution_id, q)

    return StreamingResponse(generator(), media_type="text/event-stream")


async def _broadcast(execution: Execution) -> None:
    payload = json.dumps(execution.model_dump())
    for q in _sse_queues:
        await q.put(payload)
