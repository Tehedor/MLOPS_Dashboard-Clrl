import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services import variants_service, repo_sync_service

router = APIRouter()


class DvcPayload(BaseModel):
    phase: str
    variant: str


@router.get("/sync-interval")
async def sync_interval():
    from app.core.config import load_app_config
    cfg = load_app_config()
    return {
        "repo_sync_seconds": repo_sync_service.get_interval(),
        "table_refresh_seconds": int(cfg.get("table_refresh_interval_seconds", 15)),
    }


@router.get("/phases")
async def get_phases():
    return variants_service.discover_phases()


@router.get("/exists")
async def variant_exists(phase: str = Query(...), variant: str = Query(...)):
    from app.services.execution_service import _normalize_variant
    normalized = _normalize_variant(phase, variant)
    info = variants_service.get_variant_info(phase, normalized)
    return {
        "exists": info is not None,
        "normalized": normalized,
        "status": info["status"] if info else None,
    }


@router.get("/table-config/{phase_id}")
async def get_table_config(phase_id: str):
    cfg = variants_service.get_table_config_for_phase(phase_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Phase not found in table_config")
    return cfg


@router.get("/rows")
async def get_rows(
    phase: str = Query(...),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    q: str = Query(""),
    sort_by: str = Query("variant"),
    sort_dir: str = Query("asc"),
    col_filters: str = Query(""),
):
    filters = json.loads(col_filters) if col_filters else {}
    return await variants_service.get_rows(phase, limit, offset, q, sort_by, sort_dir, filters)


@router.post("/local/pull")
async def pull(payload: DvcPayload):
    job_id = await variants_service.enqueue_pull(payload.phase, payload.variant)
    return {"job_id": job_id, "status": "queued"}


@router.post("/local/delete")
async def delete(payload: DvcPayload):
    job_id = await variants_service.enqueue_delete(payload.phase, payload.variant)
    return {"job_id": job_id, "status": "queued"}


@router.post("/sync")
async def sync(phase: str | None = None):
    pull_result = await repo_sync_service.check_and_pull()
    if phase:
        count = await variants_service.sync_phase(phase)
        return {"pulled": pull_result["pulled"], "synced": {phase: count}}
    return {"pulled": pull_result["pulled"], "synced": await variants_service.sync_all()}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = variants_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/report/{phase}/{variant}/{filename}")
async def get_report(phase: str, variant: str, filename: str):
    if not filename.endswith(".html"):
        raise HTTPException(status_code=400, detail="Only HTML files are supported")
    exec_root = variants_service._executions_root()
    path = exec_root / phase / variant / filename
    try:
        path.resolve().relative_to(exec_root.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path, media_type="text/html")
