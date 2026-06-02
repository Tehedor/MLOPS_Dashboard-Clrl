import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import load_pipelines_config, get_pipeline_project
from app.schemas.pipeline_project import PipelineProject
import app.services.project_setup_service as setup_svc

router = APIRouter()


# ── List / Get ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PipelineProject])
def list_pipeline_projects():
    projects = load_pipelines_config()
    result = []
    for pid, proj in projects.items():
        try:
            result.append(PipelineProject(id=pid, **proj))
        except Exception:
            pass
    return result


@router.get("/{pipeline_id}", response_model=PipelineProject)
def get_project(pipeline_id: str):
    try:
        proj = get_pipeline_project(pipeline_id)
        return PipelineProject(**proj)
    except ValueError:
        raise HTTPException(404, f"Pipeline project '{pipeline_id}' not found")


# ── Cycle 1: branch management ────────────────────────────────────────────────

@router.get("/{pipeline_id}/branch-status")
async def branch_status(pipeline_id: str):
    _ensure_exists(pipeline_id)
    return await setup_svc.check_branch_exists(pipeline_id)


class CreateBranchBody(BaseModel):
    base_branch: str = "main"


@router.post("/{pipeline_id}/create-branch")
async def create_branch(pipeline_id: str, body: CreateBranchBody = CreateBranchBody()):
    _ensure_exists(pipeline_id)
    try:
        return await setup_svc.create_branch(pipeline_id, body.base_branch)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


# ── Cycle 2: pipeline setup ───────────────────────────────────────────────────

@router.post("/{pipeline_id}/setup/start")
async def setup_start(pipeline_id: str):
    _ensure_exists(pipeline_id)
    if setup_svc.get_status(pipeline_id) == "running":
        return {"status": "running", "message": "Setup ya en curso"}
    asyncio.create_task(setup_svc.run_setup(pipeline_id))
    return {"status": "started"}


@router.get("/{pipeline_id}/setup/status")
def setup_status(pipeline_id: str):
    _ensure_exists(pipeline_id)
    return {
        "status": setup_svc.get_status(pipeline_id),
        "logs":   setup_svc.get_logs(pipeline_id),
    }


@router.get("/{pipeline_id}/setup/stream")
async def setup_stream(pipeline_id: str):
    _ensure_exists(pipeline_id)

    already_done = setup_svc.get_status(pipeline_id) in ("done", "failed", "idle")
    past_logs    = setup_svc.get_logs(pipeline_id)
    q            = setup_svc.subscribe(pipeline_id)

    async def generator() -> AsyncGenerator[str, None]:
        for line in past_logs:
            yield f"data: {json.dumps({'line': line})}\n\n"
        if already_done:
            setup_svc.unsubscribe(pipeline_id, q)
            yield f"data: {json.dumps({'done': True, 'status': setup_svc.get_status(pipeline_id)})}\n\n"
            return
        try:
            while True:
                item = await q.get()
                if item is None:
                    yield f"data: {json.dumps({'done': True, 'status': setup_svc.get_status(pipeline_id)})}\n\n"
                    break
                yield f"data: {json.dumps({'line': item})}\n\n"
        except asyncio.CancelledError:
            setup_svc.unsubscribe(pipeline_id, q)

    return StreamingResponse(generator(), media_type="text/event-stream")


# ── Helper ────────────────────────────────────────────────────────────────────

def _ensure_exists(pipeline_id: str) -> None:
    try:
        get_pipeline_project(pipeline_id)
    except ValueError:
        raise HTTPException(404, f"Pipeline project '{pipeline_id}' not found")
