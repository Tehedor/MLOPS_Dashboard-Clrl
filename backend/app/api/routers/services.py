from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.config import get_pipeline_project, PROJECT_ROOT
from app.services import services_service

router = APIRouter()


class CommandPayload(BaseModel):
    command: str
    env: dict[str, str] = {}


@router.get("")
def list_services(pipeline_id: str = Query(...)):
    return services_service.get_services(pipeline_id)


@router.get("/{service_id}/status")
async def get_status(service_id: str, pipeline_id: str = Query(...)):
    svc = services_service.get_service(service_id, pipeline_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    up = await services_service.check_status(svc["port"])
    return {"up": up, "port": svc["port"]}


@router.post("/{service_id}/command")
async def run_command(service_id: str, pipeline_id: str = Query(...), payload: CommandPayload = ...):
    svc = services_service.get_service(service_id, pipeline_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    # Inject EXECUTIONS_PATH so docker-compose mounts the correct pipeline dir
    try:
        proj = get_pipeline_project(pipeline_id)
        external_base = proj.get("external_base", "external/repo_actions")
        executions_path = str(PROJECT_ROOT / external_base / "repo_actions" / "executions")
    except Exception:
        executions_path = ""
    auto_env = {"EXECUTIONS_PATH": executions_path} if executions_path else {}
    result = await services_service.run_make_command(payload.command, {**auto_env, **payload.env})
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
