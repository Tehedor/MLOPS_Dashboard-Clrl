"""project_setup_service — branch lifecycle and pipeline initialization.

Cycle 1: check if a pipeline-project's branch exists in GitHub; create it if not.
Cycle 2: clone/pull the branch locally and run `make setup SETUP_CFG=setup/remote2.yaml`.
"""

import asyncio
import logging
import os
import shutil
from pathlib import Path

import httpx

from app.core.config import get_pipeline_project, get_pipeline_token, PROJECT_ROOT, settings

if os.name != "nt":
    import pty
    import termios
else:
    pty = None
    termios = None

log = logging.getLogger(__name__)

# ── data_ctrl injection mode ─────────────────────────────────────────────────
# "symlink" → ln -s (ahorra espacio; el repo externo ve un enlace simbólico absoluto)
# "copy"    → shutil.copy2 (copia física; independiente del controlador tras el setup)
DATA_CTRL_MODE: str = "symlink"

# ── Per-pipeline state ────────────────────────────────────────────────────────

# status: "idle" | "running" | "done" | "failed"
_states: dict[str, dict] = {}


def _get_state(pipeline_id: str) -> dict:
    if pipeline_id not in _states:
        _states[pipeline_id] = {"status": "idle", "logs": [], "subscribers": []}
    return _states[pipeline_id]


# ── Log store (shared with SSE subscribers) ───────────────────────────────────

def push_log(pipeline_id: str, line: str) -> None:
    state = _get_state(pipeline_id)
    state["logs"].append(line)
    for q in list(state["subscribers"]):
        q.put_nowait(line)


def subscribe(pipeline_id: str) -> asyncio.Queue:
    state = _get_state(pipeline_id)
    q: asyncio.Queue = asyncio.Queue()
    state["subscribers"].append(q)
    return q


def unsubscribe(pipeline_id: str, q: asyncio.Queue) -> None:
    state = _get_state(pipeline_id)
    if q in state["subscribers"]:
        state["subscribers"].remove(q)


def get_logs(pipeline_id: str) -> list[str]:
    return list(_get_state(pipeline_id)["logs"])


def get_status(pipeline_id: str) -> str:
    return _get_state(pipeline_id)["status"]


def _signal_done(pipeline_id: str) -> None:
    """Send sentinel None to all subscribers so they close."""
    for q in _get_state(pipeline_id)["subscribers"]:
        q.put_nowait(None)


# ── GitHub helpers ────────────────────────────────────────────────────────────

def _gh_headers(token: str = "") -> dict:
    t = token or settings.github_token
    return {
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Authorization": f"Bearer {t}",
    }


def check_initialized(pipeline_id: str) -> bool:
    """Return True if the init_marker path exists in the local repo clone."""
    proj   = get_pipeline_project(pipeline_id)
    marker = proj.get("init_marker", ".mlops4ofp")
    local_raw = proj.get("actions_repo_local_path", "")
    local_path = (
        Path(local_raw) if Path(local_raw).is_absolute()
        else PROJECT_ROOT / local_raw
    )
    return (local_path / marker).exists()


async def check_branch_exists(pipeline_id: str) -> dict:
    """Return {exists, branch, sha, initialized, error?}."""
    proj = get_pipeline_project(pipeline_id)
    repo   = proj["repo"]
    branch = proj["branch"]
    url = f"https://api.github.com/repos/{repo}/branches/{branch}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=_gh_headers(get_pipeline_token(pipeline_id)))
        if resp.status_code == 200:
            sha = resp.json().get("commit", {}).get("sha")
            return {
                "exists":      True,
                "branch":      branch,
                "sha":         sha,
                "initialized": check_initialized(pipeline_id),
            }
        return {"exists": False, "branch": branch, "sha": None, "initialized": False}
    except Exception as exc:
        return {"exists": False, "branch": branch, "sha": None, "initialized": False, "error": str(exc)}


async def create_branch(pipeline_id: str, base_branch: str = "main") -> dict:
    """Create the pipeline branch from base_branch. Returns {created, branch, sha}."""
    proj   = get_pipeline_project(pipeline_id)
    repo   = proj["repo"]
    branch = proj["branch"]
    token  = get_pipeline_token(pipeline_id)
    env_var = proj.get("github_token_env", "GITHUB_TOKEN")
    log.warning("create_branch [%s] using env_var=%s token=%s", pipeline_id, env_var, (token[:4] + "…" + token[-4:]) if len(token) > 8 else "<empty>")

    # Resolve base branch SHA
    base_url = f"https://api.github.com/repos/{repo}/branches/{base_branch}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(base_url, headers=_gh_headers(token))
    if resp.status_code != 200:
        raise ValueError(f"Base branch '{base_branch}' not found in {repo} (status {resp.status_code})")
    base_sha = resp.json()["commit"]["sha"]

    # Create the new ref
    create_url = f"https://api.github.com/repos/{repo}/git/refs"
    payload = {"ref": f"refs/heads/{branch}", "sha": base_sha}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(create_url, json=payload, headers=_gh_headers(token))
    if resp.status_code not in (200, 201):
        log.warning("create_branch [%s] POST status=%s body=%s", pipeline_id, resp.status_code, resp.text[:500])
        detail = resp.json().get("message", resp.text[:200])
        raise ValueError(f"GitHub API error creating branch: {detail}")

    log.info("create_branch [%s] created '%s' from '%s' sha=%s", pipeline_id, branch, base_branch, base_sha[:8])
    return {"created": True, "branch": branch, "sha": base_sha}


# ── PTY subprocess helper ─────────────────────────────────────────────────────

async def _run_cmd(cmd: str, cwd: Path, env: dict, pipeline_id: str) -> int:
    """Run a shell command with PTY, streaming output to push_log."""
    push_log(pipeline_id, f"$ {cmd}")

    if pty is None:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(cwd),
            env=env,
        )
        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            push_log(pipeline_id, line.rstrip(b"\r\n").decode(errors="replace"))
        await proc.wait()
        return proc.returncode or 0

    master_fd, slave_fd = pty.openpty()
    try:
        attrs = termios.tcgetattr(slave_fd)
        attrs[3] &= ~termios.ECHO
        termios.tcsetattr(slave_fd, termios.TCSANOW, attrs)
    except Exception:
        pass

    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=str(cwd),
        env=env,
        start_new_session=True,
    )
    os.close(slave_fd)

    loop  = asyncio.get_running_loop()
    buf: bytes = b""
    read_done  = asyncio.Event()

    def _on_readable() -> None:
        nonlocal buf
        try:
            data = os.read(master_fd, 4096)
            if not data:
                raise OSError("eof")
            buf += data
            while b"\n" in buf:
                nl   = buf.index(b"\n")
                line = buf[:nl].rstrip(b"\r").decode(errors="replace")
                buf  = buf[nl + 1:]
                push_log(pipeline_id, line)
            if buf:
                push_log(pipeline_id, buf.rstrip(b"\r").decode(errors="replace"))
                buf = b""
        except OSError:
            loop.remove_reader(master_fd)
            if buf:
                line = buf.rstrip(b"\r\n").decode(errors="replace")
                if line:
                    push_log(pipeline_id, line)
            read_done.set()

    loop.add_reader(master_fd, _on_readable)
    await proc.wait()

    try:
        await asyncio.wait_for(read_done.wait(), timeout=2.0)
    except asyncio.TimeoutError:
        loop.remove_reader(master_fd)

    try:
        os.close(master_fd)
    except OSError:
        pass

    return proc.returncode or 0


# ── Setup runner ──────────────────────────────────────────────────────────────

async def run_setup(pipeline_id: str) -> None:
    """Clone/pull the branch and run `make setup SETUP_CFG=setup/remote2.yaml`."""
    state = _get_state(pipeline_id)
    if state["status"] == "running":
        return

    state["status"] = "running"
    state["logs"]   = []

    try:
        proj       = get_pipeline_project(pipeline_id)
        repo       = proj["repo"]
        branch     = proj["branch"]
        local_path_raw = proj.get("actions_repo_local_path", "")
        local_path = (
            Path(local_path_raw) if Path(local_path_raw).is_absolute()
            else PROJECT_ROOT / local_path_raw
        )

        cmd_start  = proj.get("command_start", "make setup SETUP_CFG=setup/remote2.yaml")
        local_runner_raw = proj.get("local_pipeline_path", "")
        local_runner_path = (
            Path(local_runner_raw) if Path(local_runner_raw).is_absolute()
            else PROJECT_ROOT / local_runner_raw
        ) if local_runner_raw else None

        push_log(pipeline_id, f"[setup] Proyecto: {pipeline_id}")
        push_log(pipeline_id, f"[setup] Repo: {repo}  Branch: {branch}")
        push_log(pipeline_id, f"[setup] Comando: {cmd_start}")

        # Step 1 — clone main so command_start can create the feature branch
        push_log(pipeline_id, "[setup] Clonando repo_actions desde main…")
        from app.services import repo_sync_service
        clone_url = f"https://github.com/{repo}.git"
        token = get_pipeline_token(pipeline_id)
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(
                None, repo_sync_service._setup_clone, local_path, clone_url, token
            )
            push_log(pipeline_id, "[setup] repo_actions listo en main.")
        except Exception as exc:
            push_log(pipeline_id, f"[setup] Error al clonar repo_actions: {exc}")
            state["status"] = "failed"
            return

        if not local_path.exists():
            push_log(pipeline_id, f"[setup] No se encontró el directorio local: {local_path}")
            state["status"] = "failed"
            return

        # Step 1b — clone main for local_pipeline_path (repo_local_runner) if configured
        if local_runner_path and local_runner_path != local_path:
            push_log(pipeline_id, "[setup] Clonando repo_local_runner desde main…")
            try:
                await loop.run_in_executor(
                    None, repo_sync_service._setup_clone, local_runner_path, clone_url, token
                )
                push_log(pipeline_id, "[setup] repo_local_runner listo en main.")
            except Exception as exc:
                push_log(pipeline_id, f"[setup] Aviso: no se pudo clonar repo_local_runner: {exc}")

        # Step 2 — inject data files declared in data_ctrl before running command_start
        for entry in proj.get("data_ctrl", []):
            src_rel = entry.get("src", "")
            dst_rel = entry.get("dst", "")
            if not src_rel or not dst_rel:
                continue
            src_path = (PROJECT_ROOT / src_rel).resolve()
            dst_path = local_path / dst_rel
            if not src_path.exists():
                push_log(pipeline_id, f"[setup] AVISO: data_ctrl src no encontrado: {src_path}")
                continue
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if DATA_CTRL_MODE == "symlink":
                if dst_path.is_symlink() or dst_path.exists():
                    dst_path.unlink()
                dst_path.symlink_to(src_path)
                push_log(pipeline_id, f"[setup] data_ctrl symlink: {src_rel} → {dst_rel}")
            else:
                shutil.copy2(src_path, dst_path)
                push_log(pipeline_id, f"[setup] data_ctrl copiado: {src_rel} → {dst_rel}")

        # Step 3 — run command_start
        push_log(pipeline_id, f"[setup] Ejecutando: {cmd_start}…")
        env = {
            **os.environ,
            "GH_TOKEN":          get_pipeline_token(pipeline_id),
            "GITHUB_TOKEN":      get_pipeline_token(pipeline_id),
            "GITHUB_REPOSITORY": repo,
            "DAGSHUB_USER":      settings.dagshub_user,
            "DAGSHUB_TOKEN":     settings.dagshub_token,
            "PYTHONUNBUFFERED":  "1",
        }
        rc = await _run_cmd(
            cmd_start,
            cwd=local_path,
            env=env,
            pipeline_id=pipeline_id,
        )

        if rc == 0:
            push_log(pipeline_id, "[setup] ✓ Setup completado.")
            state["status"] = "done"
        else:
            push_log(pipeline_id, f"[setup] ✗ Setup falló (rc={rc}).")
            state["status"] = "failed"

    except Exception as exc:
        log.exception("run_setup [%s]: %s", pipeline_id, exc)
        push_log(pipeline_id, f"[setup] Error fatal: {exc}")
        state["status"] = "failed"
    finally:
        _signal_done(pipeline_id)
