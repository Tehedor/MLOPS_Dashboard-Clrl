import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

from app.core.config import PROJECT_ROOT, get_pipeline_project
from app.services import lineage_service, lineage_registry_service, repo_sync_service

router = APIRouter()


# ── Legacy HTML endpoints (kept for backward compat) ─────────────────────────

@router.get("/status")
async def status(pipeline_id: str = Query(...)):
    return lineage_service.get_status(pipeline_id)


@router.get("/all-statuses")
async def all_statuses():
    return lineage_service.get_all_statuses()


@router.get("/html", response_class=HTMLResponse)
async def html(pipeline_id: str = Query(...)):
    content = lineage_service.get_html(pipeline_id)
    if content is None:
        raise HTTPException(status_code=404, detail="HTML not generated yet. Use POST /refresh.")
    return content


@router.post("/refresh")
async def refresh(pipeline_id: str = Query(...)):
    try:
        pull_result = await repo_sync_service.check_and_pull(pipeline_id)
        lineage_result = await lineage_service.refresh(pipeline_id, force=True)
        return {**lineage_result, "pulled": pull_result["pulled"]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=repo_sync_service.sanitize_error_detail(str(exc)))


# ── Registry endpoints ────────────────────────────────────────────────────────

@router.get("/registry")
async def get_registry(pipeline_id: str = Query(...)):
    """Return the current lineage registry for a pipeline."""
    return lineage_registry_service.get_registry(pipeline_id)


@router.post("/registry/sync")
async def sync_registry(pipeline_id: str = Query(...)):
    """Sync the lineage registry (incremental scan of executions dir).

    Also pulls from git so the executions dir reflects the latest state.
    """
    try:
        pull_result = await repo_sync_service.check_and_pull(pipeline_id)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, lineage_registry_service.sync, pipeline_id
        )
        return {**result, "pulled": pull_result.get("pulled", False)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=repo_sync_service.sanitize_error_detail(str(exc)))


@router.get("/config")
async def get_config():
    """Return lineage phase config for all pipelines (used by the React renderer)."""
    return lineage_registry_service.get_all_configs()


@router.get("/static-html", response_class=HTMLResponse)
async def static_html(pipeline_id: str = Query(...)):
    """Read the pre-generated pipeline_lineage.html directly from disk (no regeneration)."""
    proj = get_pipeline_project(pipeline_id)
    base = proj.get("actions_repo_path_executions", "external/repo_actions/executions")
    p = Path(base) if Path(base).is_absolute() else PROJECT_ROOT / base
    html_path = p / "pipeline_lineage.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="pipeline_lineage.html not found for this pipeline.")
    return html_path.read_text(encoding="utf-8")
