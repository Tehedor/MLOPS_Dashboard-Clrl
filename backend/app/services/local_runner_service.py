"""Local runner service — executes local_workflows.yaml steps in an isolated workspace.

Uses asyncio.create_subprocess_shell so stdout/stderr stream line-by-line to
local_log_store (live SSE) without blocking the event loop.
"""

import asyncio
import json
import os
import pty
import re
import shutil
import signal
import termios
import time
from pathlib import Path

import yaml

from app.core.config import load_app_config, settings, PROJECT_ROOT, get_pipeline_project, get_pipeline_token, resolve_pipeline_config_path
from app.services import local_log_store as log_store


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _local_workflows_path(pipeline_id: str) -> Path:
    return resolve_pipeline_config_path(pipeline_id, "local_workflows", "config/local_workflows.yaml")


def _workspace_path(pipeline_id: str) -> Path:
    proj = get_pipeline_project(pipeline_id)
    raw = proj.get("local_pipeline_path", "external/repo_local_runner")
    p = Path(str(raw))
    return p if p.is_absolute() else PROJECT_ROOT / p


def _checkout_branch(pipeline_id: str) -> str:
    proj = get_pipeline_project(pipeline_id)
    return proj.get("branch", "main")


def _load_phase_workflow(fase: str, pipeline_id: str) -> dict | None:
    path = _local_workflows_path(pipeline_id)
    with open(path) as f:
        data = yaml.safe_load(f)
    for entry in data.get("fases", []):
        if entry["fase"] == fase:
            return entry
    return None


# ---------------------------------------------------------------------------
# Active-process registry — used by kill() to terminate a running execution
# ---------------------------------------------------------------------------

_ACTIVE_PROCS: dict[str, asyncio.subprocess.Process] = {}


def kill(execution_id: str) -> None:
    """Kill the subprocess tree for a running local execution (SIGTERM → PGID)."""
    proc = _ACTIVE_PROCS.get(execution_id)
    if proc is None or proc.returncode is not None:
        return
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Async subprocess — streams stdout+stderr line by line to log_store
# ---------------------------------------------------------------------------

async def _run(
    cmd: str,
    cwd: Path,
    env: dict,
    step: str,
    execution_id: str,
) -> int:
    """Run a shell command, streaming output to the log store via a PTY.

    Using a PTY (instead of PIPE) makes the subprocess believe it is connected
    to a real terminal, which disables internal buffering in most programs
    (Docker, esp-idf tools, serial readers, etc.) and allows us to read partial
    lines in real time instead of waiting for a newline.
    """
    log_store.push(execution_id, step, f"$ {cmd}")

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
        cwd=cwd,
        env=env,
        start_new_session=True,
    )
    os.close(slave_fd)
    _ACTIVE_PROCS[execution_id] = proc

    loop = asyncio.get_running_loop()
    buf: bytes = b""
    read_done = asyncio.Event()

    def _on_readable() -> None:
        nonlocal buf
        try:
            data = os.read(master_fd, 4096)
            if not data:
                raise OSError("eof")
            buf += data
            while b"\n" in buf:
                nl = buf.index(b"\n")
                line = buf[:nl].rstrip(b"\r").decode(errors="replace")
                buf = buf[nl + 1:]
                log_store.push(execution_id, step, line)
        except OSError:
            loop.remove_reader(master_fd)
            if buf:
                line = buf.rstrip(b"\r\n").decode(errors="replace")
                if line:
                    log_store.push(execution_id, step, line)
            read_done.set()

    loop.add_reader(master_fd, _on_readable)

    await proc.wait()

    try:
        await asyncio.wait_for(read_done.wait(), timeout=2.0)
    except asyncio.TimeoutError:
        loop.remove_reader(master_fd)
        if buf:
            line = buf.rstrip(b"\r\n").decode(errors="replace")
            if line:
                log_store.push(execution_id, step, line)

    _ACTIVE_PROCS.pop(execution_id, None)

    try:
        os.close(master_fd)
    except OSError:
        pass

    rc = proc.returncode
    marker = "✓ OK" if rc == 0 else f"✗ FAILED (rc={rc})"
    log_store.push(execution_id, step, marker)
    return rc


# ---------------------------------------------------------------------------
# Template interpolation
# ---------------------------------------------------------------------------

def _interpolate(template: str, ctx: dict) -> str:
    for k, v in ctx.items():
        template = template.replace(f"{{{k}}}", str(v) if v is not None else "")
    return template.strip()


def _make_params_str(params: dict) -> str:
    import shlex
    from app.services.github import normalize_make_params
    parts = []
    for k, v in normalize_make_params(params).items():
        if v is None or str(v).strip() == "":
            continue
        sv = str(v).lower() if isinstance(v, bool) else str(v)
        parts.append(f'{k}={shlex.quote(sv)}')
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Workspace setup
# ---------------------------------------------------------------------------

async def _setup_workspace(workspace: Path, branch: str, repo: str, env: dict, execution_id: str, token: str = "") -> bool:
    token = token or settings.github_token
    repo_url = f"https://x-access-token:{token}@github.com/{repo}.git"
    step = "workspace-setup"

    if not (workspace / ".git").exists():
        workspace.parent.mkdir(parents=True, exist_ok=True)
        rc = await _run(
            f"git clone --branch {branch} {repo_url} {workspace.name}",
            workspace.parent, env, step, execution_id,
        )
        if rc != 0:
            return False
    else:
        if await _run("git fetch origin", workspace, env, step, execution_id) != 0:
            return False

        # check explicitly whether the remote branch exists
        remote_exists = (
            await _run(
                f"git ls-remote --exit-code origin refs/heads/{branch}",
                workspace, env, step, execution_id,
            ) == 0
        )

        if remote_exists:
            # force-fetch the specific branch to ensure origin/{branch} tracking ref exists locally
            # (single-branch clones won't create it with a plain "git fetch origin")
            if await _run(
                f"git fetch origin +{branch}:refs/remotes/origin/{branch}",
                workspace, env, step, execution_id,
            ) != 0:
                return False
            await _run("git checkout -- .", workspace, env, step, execution_id)
            if await _run(f"git checkout -B {branch} origin/{branch}", workspace, env, step, execution_id) != 0:
                return False
        else:
            log_store.push(execution_id, step, f"[info] '{branch}' not on remote — creating from HEAD and pushing")
            if await _run(f"git checkout -B {branch}", workspace, env, step, execution_id) != 0:
                return False
            if await _run(f"git push -u origin {branch}", workspace, env, step, execution_id) != 0:
                return False

        if await _run("git clean -fdx --exclude=.dvc/cache --exclude=.venv", workspace, env, step, execution_id) != 0:
            return False

    return True


async def _setup_git_dvc(workspace: Path, env: dict, execution_id: str) -> None:
    step = "git-dvc-setup"
    for cmd in [
        'git config user.name "local-runner[bot]"',
        'git config user.email "local-runner[bot]@local"',
        'git config --global --add safe.directory "*"',
    ]:
        await _run(cmd, workspace, env, step, execution_id)

    if settings.dagshub_user and settings.dagshub_token:
        for cmd in [
            "dvc remote modify storage --local auth basic",
            f"dvc remote modify storage --local user {settings.dagshub_user}",
            f"dvc remote modify storage --local password {settings.dagshub_token}",
        ]:
            await _run(cmd, workspace, env, step, execution_id)


# ---------------------------------------------------------------------------
# DVC pull
# ---------------------------------------------------------------------------

async def _dvc_pull(workspace: Path, paths: list[str], ctx: dict, env: dict, execution_id: str) -> None:
    for raw in paths:
        path = _interpolate(raw, ctx)
        rc = await _run(f"dvc pull {path}", workspace, env, "dvc-pull", execution_id)
        if rc != 0:
            log_store.push(execution_id, "dvc-pull", f"[warn] dvc pull '{path}' failed — continuing")


# ---------------------------------------------------------------------------
# PR publish — replicates commit-and-pr GH action
# ---------------------------------------------------------------------------

async def _publish_pr(
    workspace: Path,
    step_id: str,
    fase_id: str,
    variant_id: str,
    commit_paths: list[str],
    ctx: dict,
    env: dict,
    execution_id: str,
    repo: str,
    exclude_exts: list[str] | None = None,
) -> bool:
    ts = int(time.time())
    branch = f"mlops/{fase_id}-{step_id}-{variant_id}-local-{ts}"
    base = ctx["checkout_branch"]
    label = f"pr-{step_id}"

    for raw in commit_paths:
        path = _interpolate(raw, ctx)
        await _run(f"git add -- {path} 2>/dev/null || true", workspace, env, label, execution_id)

    if exclude_exts:
        exts = "|".join(re.escape(e.lstrip(".")) for e in exclude_exts)
        unstage_cmd = (
            f"git diff --cached --name-only | grep -E '\\.({exts})$' | xargs -r git restore --staged --"
        )
        await _run(unstage_cmd, workspace, env, label, execution_id)

    rc = await _run("git diff --cached --quiet", workspace, env, label, execution_id)
    if rc == 0:
        log_store.push(execution_id, label, f"[info] no staged changes for {step_id} — skipping PR")
        return True

    if await _run(f"git checkout -b {branch}", workspace, env, label, execution_id) != 0:
        return False

    msg = f"🤖 AutoML ({fase_id}/{step_id}): {variant_id}"
    if await _run(f'git commit -m "{msg}"', workspace, env, label, execution_id) != 0:
        return False

    pushed = False
    for attempt in range(1, 4):
        if await _run(f"git push -u origin {branch}", workspace, env, label, execution_id) == 0:
            pushed = True
            break
        await asyncio.sleep(attempt * 3)
    if not pushed:
        log_store.push(execution_id, label, "[error] push failed after 3 attempts")
        return False

    pr_title = f"🚀 AutoML {fase_id}/{step_id}: {variant_id}"
    pr_body = f"PR automática para **{variant_id}**, step **{step_id}**. Runner: Local."
    create_cmd = (
        f'gh api -X POST repos/{repo}/pulls '
        f'-f title="{pr_title}" '
        f'-f body="{pr_body}" '
        f'-f base="{base}" '
        f'-f head="{branch}" '
        f"--jq '.number' > /tmp/_pr_num_{execution_id[:8]}.txt"
    )
    rc = await _run(create_cmd, workspace, env, label, execution_id)
    pr_num_file = Path(f"/tmp/_pr_num_{execution_id[:8]}.txt")
    pr_number = pr_num_file.read_text().strip() if pr_num_file.exists() else ""
    pr_num_file.unlink(missing_ok=True)
    if rc != 0 or not pr_number:
        log_store.push(execution_id, label, "[error] PR creation failed")
        return False

    merged = False
    for attempt in range(1, 6):
        if await _run(f"gh pr merge {pr_number} --squash --delete-branch", workspace, env, label, execution_id) == 0:
            merged = True
            break
        await asyncio.sleep(attempt * 3)
    if not merged:
        log_store.push(execution_id, label, f"[error] PR #{pr_number} merge failed after 5 attempts")
        return False

    await _run(f"git checkout {base}", workspace, env, label, execution_id)
    await _run(f"git fetch origin +{base}:refs/remotes/origin/{base}", workspace, env, label, execution_id)
    await _run(f"git reset --hard origin/{base}", workspace, env, label, execution_id)
    return True


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run_local_phase(ex) -> bool:
    """Execute a local phase workflow. Returns True on full success."""
    execution_id = ex.id
    fase = ex.fase
    variant_id = ex.variant
    parent_id = ex.parent
    params = ex.params or {}
    pipeline_id = ex.pipeline_id

    workflow = _load_phase_workflow(fase, pipeline_id)
    if workflow is None:
        log_store.push(execution_id, "init", f"[error] No workflow defined for fase '{fase}'")
        log_store.close(execution_id)
        return False

    proj = get_pipeline_project(pipeline_id)
    workspace = _workspace_path(pipeline_id)
    branch = _checkout_branch(pipeline_id)
    repo = proj["repo"]
    make_params = _make_params_str(params)

    parents_ids = parent_id or ""
    if parents_ids.startswith("["):
        try:
            parents_ids = ",".join(str(p).strip() for p in json.loads(parents_ids))
        except (json.JSONDecodeError, TypeError):
            pass

    ctx = {
        "variant_id":      variant_id,
        "parent_id":       parent_id or "",
        "parents_ids":     parents_ids,
        "checkout_branch": branch,
        "make_params":     make_params,
        "workspace":       str(workspace),
    }

    use_venv = str(load_app_config().get("local_runner_use_venv", "0"))
    env = {
        **os.environ,
        "GH_TOKEN":          get_pipeline_token(pipeline_id),
        "GITHUB_TOKEN":      get_pipeline_token(pipeline_id),
        "GITHUB_REPOSITORY": repo,
        "DAGSHUB_USER":      settings.dagshub_user,
        "DAGSHUB_TOKEN":     settings.dagshub_token,
        "USE_VENV":          use_venv,
        "SKIP_GIT_PUBLISH":  "1",
        "SKIP_LINEAGE":      "1",
        "MLOPS_RUNNER":      ex.runner or "Local",
        "VARIANT_ROOT":      f"executions/{fase}/{variant_id}",
        "PYTHONUNBUFFERED":  "1",
    }

    log_store.push(execution_id, "init", f"[local-runner] {fase}/{variant_id} — workspace: {workspace}")

    if not await _setup_workspace(workspace, branch, repo, env, execution_id, get_pipeline_token(pipeline_id)):
        log_store.push(execution_id, "init", "[error] workspace setup failed")
        log_store.close(execution_id)
        return False

    variant_dir = workspace / "executions" / fase / variant_id
    if variant_dir.exists():
        shutil.rmtree(variant_dir)
        log_store.push(execution_id, "init", f"[info] carpeta preexistente eliminada: executions/{fase}/{variant_id}")

    await _setup_git_dvc(workspace, env, execution_id)

    if use_venv == "1":
        venv_dir = workspace / ".venv"
        if not (venv_dir / "bin" / "python3").exists():
            log_store.push(execution_id, "python-setup", "[info] Creando venv (solo la primera vez)…")
            await _run("python3 -m venv .venv", workspace, env, "python-setup", execution_id)
        log_store.push(execution_id, "python-setup", "[info] Comprobando dependencias (requirements.txt)…")
        await _run(".venv/bin/pip install --quiet -r requirements.txt", workspace, env, "python-setup", execution_id)

    dvc_paths = workflow.get("dvc_pull", [])
    if dvc_paths:
        await _dvc_pull(workspace, dvc_paths, ctx, env, execution_id)

    all_ok = True
    for step in workflow.get("steps", []):
        always_run = step.get("always_run", False)
        if not all_ok and not always_run:
            log_store.push(execution_id, step["name"], f"[skip] prior failure")
            continue

        cmd = _interpolate(step["cmd"], ctx)
        log_store.push(execution_id, step["name"], f"=== {step['name']} ===")
        rc = await _run(cmd, workspace, env, step["name"], execution_id)
        if rc != 0:
            all_ok = False

        if step.get("publish_pr", False):
            m = re.search(r"f(\d{2})", fase)
            fase_id = f"f{int(m.group(1))}" if m else fase
            pr_ok = await _publish_pr(
                workspace,
                step_id=step.get("step_id", step["name"]),
                fase_id=fase_id,
                variant_id=variant_id,
                commit_paths=step.get("commit_paths", []),
                ctx=ctx,
                env=env,
                execution_id=execution_id,
                repo=repo,
                exclude_exts=workflow.get("exclude_exts", []),
            )
            if not pr_ok and all_ok:
                all_ok = False

    result = "SUCCESS" if all_ok else "FAILED"
    log_store.push(execution_id, "done", f"[local-runner] {fase}/{variant_id} — {result}")
    log_store.close(execution_id)
    return all_ok
