import asyncio
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import PROJECT_ROOT, load_app_config, load_pipelines_config, get_pipeline_project, settings

log = logging.getLogger(__name__)

_states: dict[str, dict] = {}  # keyed by pipeline_id
_callbacks: list = []


def _default_state() -> dict:
    return {"sha": None, "updated_at": None, "error": None}


def _get_state(pipeline_id: str) -> dict:
    if pipeline_id not in _states:
        _states[pipeline_id] = _default_state()
    return _states[pipeline_id]


def register_callback(fn) -> None:
    _callbacks.append(fn)


def get_interval() -> int:
    return int(load_app_config().get("repo_sync_interval_seconds", 60))


def get_sha(pipeline_id: str) -> str | None:
    return _states.get(pipeline_id, {}).get("sha")


def get_local_path(pipeline_id: str) -> Path:
    _, _, _, local_path, _ = _project_config(pipeline_id)
    return local_path


def get_status(pipeline_id: str) -> dict:
    state = _get_state(pipeline_id)
    try:
        owner, name, branch, _, _ = _project_config(pipeline_id)
    except Exception:
        owner, name, branch = "?", "?", "?"
    return {
        "pipeline_id": pipeline_id,
        "repo": f"{owner}/{name}",
        "branch": branch,
        "sha": state["sha"],
        "updated_at": state["updated_at"],
        "error": state["error"],
    }


def get_all_statuses() -> list[dict]:
    return [get_status(pid) for pid in load_pipelines_config()]


def _project_config(pipeline_id: str) -> tuple[str, str, str, Path, str]:
    proj = get_pipeline_project(pipeline_id)
    full_repo = proj["repo"]
    branch = proj["branch"]
    local_raw = proj.get("actions_repo_local_path", "external/repo_actions")
    owner, name = full_repo.split("/", 1)
    local_path = (
        Path(local_raw) if Path(local_raw).is_absolute() else PROJECT_ROOT / local_raw
    )
    clone_url = f"https://github.com/{owner}/{name}.git"
    return owner, name, branch, local_path, clone_url


def _clone(local_path: Path, url: str, branch: str) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "clone", "--branch", branch, "--single-branch", url, str(local_path)],
        check=True,
        capture_output=True,
    )
    log.info("repo cloned url=%s branch=%s path=%s", url, branch, local_path)


def _ensure_cloned(local_path: Path, url: str, branch: str) -> None:
    if not (local_path / ".git").exists():
        log.info("repo not found, cloning url=%s", url)
        _clone(local_path, url, branch)


async def _latest_sha(owner: str, repo: str, branch: str) -> str:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/commits",
            headers=headers,
            params={"sha": branch, "per_page": 1},
        )
        r.raise_for_status()
        return r.json()[0]["sha"]


def _pull(local_path: Path, branch: str) -> None:
    subprocess.run(
        ["git", "-C", str(local_path), "fetch", "origin", branch],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(local_path), "reset", "--hard", f"origin/{branch}"],
        check=True, capture_output=True,
    )


async def check_and_pull(pipeline_id: str) -> dict:
    """Check latest SHA for one project; pull only if new commit. No callbacks fired."""
    owner, name, branch, local_path, clone_url = _project_config(pipeline_id)
    state = _get_state(pipeline_id)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch)
    sha = await _latest_sha(owner, name, branch)
    pulled = False
    if sha != state["sha"]:
        await loop.run_in_executor(None, _pull, local_path, branch)
        state.update(sha=sha, updated_at=datetime.now(timezone.utc).isoformat(), error=None)
        log.info("repo check-pull [%s] sha=%s", pipeline_id, sha[:8])
        pulled = True
    return {"sha": sha, "pulled": pulled, "updated_at": state["updated_at"]}


async def force_pull(pipeline_id: str | None = None) -> None:
    """Pull immediately. If pipeline_id is None, pulls all registered projects."""
    projects = load_pipelines_config()
    targets = [pipeline_id] if pipeline_id else list(projects.keys())
    for pid in targets:
        await _force_pull_one(pid)


async def _force_pull_one(pipeline_id: str) -> None:
    state = _get_state(pipeline_id)
    try:
        owner, name, branch, local_path, clone_url = _project_config(pipeline_id)
    except ValueError as exc:
        log.warning("force_pull: %s", exc)
        return
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch)
    try:
        await loop.run_in_executor(None, _pull, local_path, branch)
        sha = await _latest_sha(owner, name, branch)
        state.update(sha=sha, updated_at=datetime.now(timezone.utc).isoformat(), error=None)
        log.info("force_pull [%s] done sha=%s", pipeline_id, sha[:8])
    except Exception as exc:
        state["error"] = str(exc)
        log.warning("force_pull [%s] error: %s", pipeline_id, exc)
        return
    for cb in _callbacks:
        try:
            await cb(pipeline_id)
        except Exception as exc:
            log.warning("force_pull callback error [%s]: %s", pipeline_id, exc)


async def polling_loop() -> None:
    interval = get_interval()
    log.info("repo_sync started interval=%ds", interval)
    while True:
        for pipeline_id in load_pipelines_config():
            state = _get_state(pipeline_id)
            try:
                owner, name, branch, local_path, clone_url = _project_config(pipeline_id)
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch)
                sha = await _latest_sha(owner, name, branch)
                if sha != state["sha"]:
                    await loop.run_in_executor(None, _pull, local_path, branch)
                    state.update(
                        sha=sha,
                        updated_at=datetime.now(timezone.utc).isoformat(),
                        error=None,
                    )
                    log.info("repo synced [%s] sha=%s", pipeline_id, sha[:8])
                    for cb in _callbacks:
                        try:
                            await cb(pipeline_id)
                        except Exception as exc:
                            log.warning("repo_sync callback error [%s]: %s", pipeline_id, exc)
            except Exception as exc:
                state["error"] = str(exc)
                log.warning("repo_sync poll error [%s]: %s", pipeline_id, exc)
        await asyncio.sleep(interval)
