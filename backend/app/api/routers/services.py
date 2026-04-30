from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import services_service

router = APIRouter()


class CommandPayload(BaseModel):
    command: str
    env: dict[str, str] = {}


@router.get("")
def list_services():
    return services_service.get_services()


@router.get("/{service_id}/status")
async def get_status(service_id: str):
    svc = services_service.get_service(service_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    up = await services_service.check_status(svc["port"])
    return {"up": up, "port": svc["port"]}


@router.post("/{service_id}/command")
async def run_command(service_id: str, payload: CommandPayload):
    svc = services_service.get_service(service_id)
    if svc is None:
        raise HTTPException(status_code=404, detail="Service not found")
    result = await services_service.run_make_command(payload.command, payload.env)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result["error"])
    return result
