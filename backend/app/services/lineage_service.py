import asyncio
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import PROJECT_ROOT, load_pipelines_config
from app.services import repo_sync_service

log = logging.getLogger(__name__)

_states: dict[str, dict] = {}  # keyed by pipeline_id

_SCRIPT = PROJECT_ROOT / "scripts" / "run_generate_lineage.sh"


def _get_state(pipeline_id: str) -> dict:
    if pipeline_id not in _states:
        _states[pipeline_id] = {"last_sha": None, "html": None, "updated_at": None, "error": None}
    return _states[pipeline_id]


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


async def refresh(pipeline_id: str, force: bool = False) -> dict:
    state = _get_state(pipeline_id)
    local_path = repo_sync_service.get_local_path(pipeline_id)
    sha = repo_sync_service.get_sha(pipeline_id)

    if not force and sha is not None and sha == state["last_sha"] and state["html"]:
        return {"sha": sha, "updated": False, "updated_at": state["updated_at"]}

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _generate, local_path)

    state.update(
        last_sha=sha,
        html=_read_html(local_path),
        updated_at=datetime.now(timezone.utc).isoformat(),
        error=None,
    )
    log.info("lineage generated [%s] sha=%s", pipeline_id, sha[:8] if sha else "unknown")
    return {"sha": sha, "updated": True, "updated_at": state["updated_at"]}


def get_html(pipeline_id: str) -> str | None:
    return _states.get(pipeline_id, {}).get("html")


def get_status(pipeline_id: str) -> dict:
    state = _get_state(pipeline_id)
    sync = repo_sync_service.get_status(pipeline_id)
    return {
        **sync,
        "last_generated_sha": state["last_sha"],
        "updated_at": state["updated_at"],
        "html_ready": state["html"] is not None,
        "error": state["error"] or sync.get("error"),
    }


def get_all_statuses() -> list[dict]:
    return [get_status(pid) for pid in load_pipelines_config()]
