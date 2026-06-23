import asyncio
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import PROJECT_ROOT, load_app_config, load_pipelines_config, get_pipeline_project, get_pipeline_token, settings

log = logging.getLogger(__name__)

_states: dict[str, dict] = {}  # keyed by pipeline_id
_callbacks: list = []
_pull_locks: dict[str, asyncio.Lock] = {}


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


def _authed_url(url: str, token: str = "") -> str:
    """Inject token into HTTPS URL if available."""
    t = token or settings.github_token
    if t and url.startswith("https://github.com/"):
        return url.replace("https://", f"https://{t}@", 1)
    return url


def _get_remote_name(local_path: Path) -> str:
    """Read publish_remote_name from .mlops4ofp/setup.yaml, fallback to 'origin'."""
    setup = local_path / ".mlops4ofp" / "setup.yaml"
    if setup.exists():
        try:
            import yaml
            data = yaml.safe_load(setup.read_text(encoding="utf-8")) or {}
            name = data.get("git", {}).get("publish_remote_name", "") or ""
            if name:
                return name
        except Exception:
            pass
    return "origin"


def _clone(local_path: Path, url: str, branch: str, token: str = "") -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["git", "clone", "--branch", branch, "--single-branch", _authed_url(url, token), str(local_path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode,
            "git clone",
            output=result.stdout,
            stderr=result.stderr,
        )
    log.info("repo cloned url=%s branch=%s path=%s", url, branch, local_path)


def _ensure_cloned(local_path: Path, url: str, branch: str, token: str = "") -> None:
    if not (local_path / ".git").exists():
        log.info("repo not found, cloning url=%s", url)
        _clone(local_path, url, branch, token)
    else:
        remote = _get_remote_name(local_path)
        authed = _authed_url(url, token)
        subprocess.run(
            ["git", "-C", str(local_path), "remote", "set-url", remote, authed],
            check=True, capture_output=True,
        )


def _setup_clone(local_path: Path, clone_url: str, token: str = "") -> None:
    """Clone main (or reset to it) so command_start can create the feature branch.
    Always targets main — the pipeline's working branch is created by command_start."""
    if not (local_path / ".git").exists():
        _clone(local_path, clone_url, "main", token)
    else:
        remote = _get_remote_name(local_path)
        authed = _authed_url(clone_url, token)
        subprocess.run(
            ["git", "-C", str(local_path), "remote", "set-url", remote, authed],
            check=True, capture_output=True,
        )
        _pull(local_path, "main")


async def _latest_sha(owner: str, repo: str, branch: str, token: str = "") -> str:
    t = token or settings.github_token
    headers = {"Accept": "application/vnd.github.v3+json"}
    if t:
        headers["Authorization"] = f"Bearer {t}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/commits",
            headers=headers,
            params={"sha": branch, "per_page": 1},
        )
        r.raise_for_status()
        return r.json()[0]["sha"]


def _pull(local_path: Path, branch: str) -> None:
    remote = _get_remote_name(local_path)
    subprocess.run(
        ["git", "-C", str(local_path), "remote", "prune", remote],
        capture_output=True,
    )
    lock_file = local_path / ".git" / "index.lock"
    if lock_file.exists():
        lock_file.unlink(missing_ok=True)
    subprocess.run(
        ["git", "-C", str(local_path), "fetch", remote, branch],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(local_path), "reset", "--hard", f"{remote}/{branch}"],
        check=True, capture_output=True,
    )


async def check_and_pull(pipeline_id: str) -> dict:
    """Check latest SHA for one project; pull only if new commit. No callbacks fired."""
    owner, name, branch, local_path, clone_url = _project_config(pipeline_id)
    token = get_pipeline_token(pipeline_id)
    state = _get_state(pipeline_id)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch, token)
    sha = await _latest_sha(owner, name, branch, token)
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
        lock = _pull_locks.get(pid)
        if lock is None:
            lock = asyncio.Lock()
            _pull_locks[pid] = lock
        if lock.locked():
            continue
        async with lock:
            await _force_pull_one(pid)


async def _force_pull_one(pipeline_id: str) -> None:
    state = _get_state(pipeline_id)
    try:
        owner, name, branch, local_path, clone_url = _project_config(pipeline_id)
    except ValueError as exc:
        log.warning("force_pull: %s", exc)
        return
    token = get_pipeline_token(pipeline_id)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch, token)
    try:
        await loop.run_in_executor(None, _pull, local_path, branch)
        sha = await _latest_sha(owner, name, branch, token)
        state.update(sha=sha, updated_at=datetime.now(timezone.utc).isoformat(), error=None)
        log.info("force_pull [%s] done sha=%s", pipeline_id, sha[:8])
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr or b""
        detail = (stderr.decode("utf-8", errors="replace") if isinstance(stderr, bytes) else str(stderr)).strip() or str(exc)
        state["error"] = detail
        if "Remote branch" in detail and "not found" in detail:
            log.debug("force_pull skip [%s]: branch not yet initialized", pipeline_id)
        else:
            log.warning("force_pull [%s] error: %s", pipeline_id, detail)
        return
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
                token = get_pipeline_token(pipeline_id)
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _ensure_cloned, local_path, clone_url, branch, token)
                sha = await _latest_sha(owner, name, branch, token)
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
            except subprocess.CalledProcessError as exc:
                stderr = exc.stderr or b""
                detail = (stderr.decode("utf-8", errors="replace") if isinstance(stderr, bytes) else str(stderr)).strip() or str(exc)
                state["error"] = detail
                if "Remote branch" in detail and "not found" in detail:
                    log.debug("repo_sync skip [%s]: branch not yet initialized", pipeline_id)
                else:
                    log.warning("repo_sync poll error [%s]: %s", pipeline_id, detail)
            except Exception as exc:
                state["error"] = str(exc)
                log.warning("repo_sync poll error [%s]: %s", pipeline_id, exc)
        await asyncio.sleep(interval)
