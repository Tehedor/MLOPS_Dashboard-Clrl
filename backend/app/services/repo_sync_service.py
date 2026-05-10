import asyncio
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import PROJECT_ROOT, load_app_config, settings

log = logging.getLogger(__name__)

_state: dict = {"sha": None, "updated_at": None, "error": None}
_callbacks: list = []


def register_callback(fn) -> None:
    _callbacks.append(fn)


def get_sha() -> str | None:
    return _state["sha"]


def get_interval() -> int:
    return int(load_app_config().get("repo_sync_interval_seconds", 60))


def get_local_path() -> Path:
    _, _, _, local_path, _ = _repo_config()
    return local_path


def get_status() -> dict:
    owner, name, branch, _, _ = _repo_config()
    return {
        "repo": f"{owner}/{name}",
        "branch": branch,
        "sha": _state["sha"],
        "updated_at": _state["updated_at"],
        "error": _state["error"],
    }


def _repo_config() -> tuple[str, str, str, Path, str]:
    cfg = load_app_config()
    full_repo = cfg.get("github_actions_repository", settings.github_repo)
    branch = cfg.get("actions_branch", "main")
    local_raw = cfg.get("actions_repo_local_path", "external/repo_actions")
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
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(local_path), "reset", "--hard", f"origin/{branch}"],
        check=True,
        capture_output=True,
    )


async def check_and_pull() -> dict:
    """Check latest SHA; pull only if there is a new commit. No callbacks fired."""
    owner, name, branch, local_path, clone_url = _repo_config()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch)
    sha = await _latest_sha(owner, name, branch)
    pulled = False
    if sha != _state["sha"]:
        await loop.run_in_executor(None, _pull, local_path, branch)
        _state.update(sha=sha, updated_at=datetime.now(timezone.utc).isoformat(), error=None)
        log.info("repo check-pull sha=%s", sha[:8])
        pulled = True
    return {"sha": sha, "pulled": pulled, "updated_at": _state["updated_at"]}


async def force_pull() -> None:
    """Pull inmediato sin comparar SHA. Disparado por Supabase Realtime al completarse un run."""
    owner, name, branch, local_path, clone_url = _repo_config()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch)
    try:
        await loop.run_in_executor(None, _pull, local_path, branch)
        sha = await _latest_sha(owner, name, branch)
        _state.update(sha=sha, updated_at=datetime.now(timezone.utc).isoformat(), error=None)
        log.info("force_pull done sha=%s", sha[:8])
    except Exception as exc:
        _state["error"] = str(exc)
        log.warning("force_pull error: %s", exc)
        return
    for cb in _callbacks:
        try:
            await cb()
        except Exception as exc:
            log.warning("force_pull callback error: %s", exc)


async def polling_loop() -> None:
    cfg = load_app_config()
    interval = int(cfg.get("repo_sync_interval_seconds", 60))
    log.info("repo_sync started interval=%ds", interval)
    while True:
        try:
            owner, name, branch, local_path, clone_url = _repo_config()
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch)
            sha = await _latest_sha(owner, name, branch)
            if sha != _state["sha"]:
                await loop.run_in_executor(None, _pull, local_path, branch)
                _state.update(
                    sha=sha,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                    error=None,
                )
                log.info("repo synced sha=%s", sha[:8])
                for cb in _callbacks:
                    try:
                        await cb()
                    except Exception as exc:
                        log.warning("repo_sync callback error: %s", exc)
        except Exception as exc:
            _state["error"] = str(exc)
            log.warning("repo_sync poll error: %s", exc)
        await asyncio.sleep(interval)
