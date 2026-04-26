from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.services import lineage_service, repo_sync_service

router = APIRouter()


@router.get("/status")
async def status():
    return lineage_service.get_status()


@router.get("/html", response_class=HTMLResponse)
async def html():
    content = lineage_service.get_html()
    if content is None:
        raise HTTPException(status_code=404, detail="HTML no generado aún. Usa POST /refresh.")
    return content


@router.post("/refresh")
async def refresh():
    try:
        pull_result = await repo_sync_service.check_and_pull()
        lineage_result = await lineage_service.refresh(force=True)
        return {**lineage_result, "pulled": pull_result["pulled"]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
