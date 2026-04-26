import asyncio
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import PROJECT_ROOT
from app.services import repo_sync_service

log = logging.getLogger(__name__)

_state: dict = {"last_sha": None, "html": None, "updated_at": None, "error": None}

_SCRIPT = PROJECT_ROOT / "scripts" / "run_generate_lineage.sh"


def _generate(local_path: Path) -> None:
    result = subprocess.run(
        ["bash", str(_SCRIPT), str(local_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-2000:] or result.stdout[-2000:])


def _read_html(local_path: Path) -> str:
    p = local_path / "executions" / "pipeline_lineage.html"
    if not p.exists():
        return (
            "<div style='padding:2rem;font-family:sans-serif;color:#888'>"
            "<p><strong>pipeline_lineage.html</strong> no encontrado.</p>"
            "<p>Pulsa <em>Refresh</em> para generar.</p></div>"
        )
    return p.read_text()


async def refresh(force: bool = False) -> dict:
    local_path = repo_sync_service.get_local_path()
    sha = repo_sync_service.get_sha()

    if not force and sha is not None and sha == _state["last_sha"] and _state["html"]:
        return {"sha": sha, "updated": False, "updated_at": _state["updated_at"]}

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _generate, local_path)

    _state.update(
        last_sha=sha,
        html=_read_html(local_path),
        updated_at=datetime.now(timezone.utc).isoformat(),
        error=None,
    )
    log.info("lineage generated sha=%s", sha[:8] if sha else "unknown")
    return {"sha": sha, "updated": True, "updated_at": _state["updated_at"]}


def get_html() -> str | None:
    return _state["html"]


def get_status() -> dict:
    sync = repo_sync_service.get_status()
    return {
        **sync,
        "last_generated_sha": _state["last_sha"],
        "updated_at": _state["updated_at"],
        "html_ready": _state["html"] is not None,
        "error": _state["error"] or sync.get("error"),
    }
