import asyncio
import json
import logging
import os
import shlex
import shutil
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiosqlite
import yaml

from app.core.config import (
    load_app_config, PROJECT_ROOT, settings, get_pipeline_project, get_pipeline_token,
    load_pipelines_config, resolve_pipeline_config_path,
)
from app.core.db import connect

log = logging.getLogger(__name__)

_sync_locks: dict[str, asyncio.Lock] = {}


# ── Config helpers ────────────────────────────────────────────────────────────

def _load_table_config(pipeline_id: str) -> dict:
    tc_path = resolve_pipeline_config_path(pipeline_id, "table_config", "config/table_config.yaml")
    if not tc_path.exists():
        return {}
    with open(tc_path) as f:
        return yaml.safe_load(f) or {}


def _executions_root(pipeline_id: str) -> Path:
    proj = get_pipeline_project(pipeline_id)
    p = Path(proj.get("actions_repo_path_executions", "external/repo_actions/executions"))
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    return p


def _repo_root(pipeline_id: str) -> Path:
    proj = get_pipeline_project(pipeline_id)
    p = Path(proj.get("actions_repo_local_path", "external/repo_actions"))
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    return p


def _deep_get(d: dict, path: str):
    cur = d
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _phase_cfg(table_config: dict, phase_id: str) -> Optional[dict]:
    for ph in table_config.get("phases", []):
        if ph.get("id") == phase_id:
            return ph
    return None


def _sources(phase_cfg: dict) -> list:
    return phase_cfg.get("sources") or phase_cfg.get("source") or []


# ── Discovery ─────────────────────────────────────────────────────────────────

def discover_phases(pipeline_id: str) -> list[str]:
    root = _executions_root(pipeline_id)
    if not root.exists():
        return []
    return sorted(p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith("."))


def discover_variants(phase_id: str, pipeline_id: str) -> list[str]:
    root = _executions_root(pipeline_id) / phase_id
    if not root.exists():
        return []
    return sorted(p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith("."))


def get_variant_info(phase_id: str, variant_id: str, pipeline_id: str) -> dict | None:
    variant_path = _executions_root(pipeline_id) / phase_id / variant_id
    if not variant_path.exists():
        return None
    meta_path = variant_path / "metadata.yaml"
    if meta_path.exists():
        try:
            meta = yaml.safe_load(meta_path.read_text()) or {}
            lifecycle = meta.get("lifecycle_state", "UNKNOWN")
        except Exception:
            lifecycle = "ERROR"
    else:
        lifecycle = "PENDING"
    if lifecycle == "EXECUTION_COMPLETED":
        status = "completed"
    elif lifecycle in ("EXECUTION_FAILED", "ERROR"):
        status = "failed"
    elif lifecycle == "PENDING":
        status = "pending"
    else:
        status = "running"
    return {"status": status}


# ── Local-status ──────────────────────────────────────────────────────────────

def _local_status(variant_path: Path) -> dict:
    dvc_files = list(variant_path.glob("*.dvc"))
    if not dvc_files:
        return {"local_status": "not_local", "local_files_present": 0,
                "local_files_expected": 0, "local_size_bytes": 0}
    expected = present = size = 0
    for dvc_file in dvc_files:
        try:
            data = yaml.safe_load(dvc_file.read_text()) or {}
            for out in data.get("outs", []):
                artifact = out.get("path")
                if artifact:
                    expected += 1
                    real = variant_path / artifact
                    if real.exists():
                        present += 1
                        size += real.stat().st_size
        except Exception:
            pass
    if expected == 0 or present == 0:
        status = "not_local"
    elif present == expected:
        status = "local"
    else:
        status = "partial"
    return {"local_status": status, "local_files_present": present,
            "local_files_expected": expected, "local_size_bytes": size}


# ── Parsing ───────────────────────────────────────────────────────────────────

_PARAMS_NAMES = ("params.yaml", "params.yml")
_OUTPUTS_NAMES = ("outputs.yaml", "output.yaml", "outputs.yml", "output.yml")


def _read_yaml(variant_path: Path, candidates: tuple) -> tuple[dict, Optional[str]]:
    for name in candidates:
        p = variant_path / name
        if p.exists():
            try:
                return yaml.safe_load(p.read_text()) or {}, None
            except Exception as e:
                return {}, str(e)
    return {}, None


def _parse_variant(phase_id: str, variant_id: str, pipeline_id: str) -> dict:
    variant_path = _executions_root(pipeline_id) / phase_id / variant_id
    params_data, params_err = _read_yaml(variant_path, _PARAMS_NAMES)
    outputs_data, outputs_err = _read_yaml(variant_path, _OUTPUTS_NAMES)

    errors = [e for e in (params_err, outputs_err) if e]
    parse_error = "; ".join(errors) if errors else None

    local = _local_status(variant_path)
    return {
        "id": f"{pipeline_id}/{phase_id}/{variant_id}",
        "pipeline_id": pipeline_id,
        "phase": phase_id,
        "variant": variant_id,
        **local,
        "params_json": json.dumps(params_data),
        "outputs_json": json.dumps(outputs_data),
        "parse_error": parse_error,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── SQLite sync ───────────────────────────────────────────────────────────────

_UPSERT = """
INSERT INTO execution_variants
  (id, pipeline_id, phase, variant, local_status, local_files_present,
   local_files_expected, local_size_bytes, params_json,
   outputs_json, parse_error, updated_at)
VALUES (:id, :pipeline_id, :phase, :variant, :local_status, :local_files_present,
        :local_files_expected, :local_size_bytes, :params_json,
        :outputs_json, :parse_error, :updated_at)
ON CONFLICT(id) DO UPDATE SET
  local_status=excluded.local_status,
  local_files_present=excluded.local_files_present,
  local_files_expected=excluded.local_files_expected,
  local_size_bytes=excluded.local_size_bytes,
  params_json=excluded.params_json,
  outputs_json=excluded.outputs_json,
  parse_error=excluded.parse_error,
  updated_at=excluded.updated_at
"""


async def sync_variant(phase_id: str, variant_id: str, pipeline_id: str) -> None:
    row = _parse_variant(phase_id, variant_id, pipeline_id)
    async with connect() as db:
        await db.execute(_UPSERT, row)
        await db.commit()


async def sync_phase(phase_id: str, pipeline_id: str) -> int:
    variants = discover_variants(phase_id, pipeline_id)
    rows = [_parse_variant(phase_id, v, pipeline_id) for v in variants]
    async with connect() as db:
        await db.executemany(_UPSERT, rows)
        if variants:
            placeholders = ",".join("?" * len(variants))
            await db.execute(
                f"DELETE FROM execution_variants WHERE pipeline_id = ? AND phase = ? "
                f"AND variant NOT IN ({placeholders})",
                [pipeline_id, phase_id, *variants],
            )
        else:
            await db.execute(
                "DELETE FROM execution_variants WHERE pipeline_id = ? AND phase = ?",
                (pipeline_id, phase_id),
            )
        await db.commit()
    return len(rows)


async def sync_all(pipeline_id: str | None = None) -> dict:
    """Sync all phases for one or all pipeline-projects."""
    key = pipeline_id or "__all__"
    lock = _sync_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _sync_locks[key] = lock
    if lock.locked():
        return {}

    async with lock:
        if pipeline_id:
            projects = {pipeline_id: None}
        else:
            projects = load_pipelines_config()
        result = {}
        for pid in projects:
            try:
                phases = discover_phases(pid)
                for ph in phases:
                    count = await sync_phase(ph, pid)
                    result[f"{pid}/{ph}"] = count
            except Exception as exc:
                log.warning("sync_all error [%s]: %s", pid, exc)
        return result


# ── Query ─────────────────────────────────────────────────────────────────────

_ALLOWED_SORT = {"variant", "local_status", "local_size_bytes", "updated_at"}


def _id_count(ph_cfg: Optional[dict]) -> dict[str, int]:
    count: dict[str, int] = {}
    for src in _sources(ph_cfg or {}):
        for col in src.get("columns", []):
            count[col["id"]] = count.get(col["id"], 0) + 1
    return count


def _build_cells(rd: dict, ph_cfg: Optional[dict], idc: dict[str, int], pipeline_id: str) -> dict:
    params_data = json.loads(rd.get("params_json") or "{}")
    outputs_data = json.loads(rd.get("outputs_json") or "{}")
    cells: dict = {"variant": rd["variant"]}
    if ph_cfg:
        for src in _sources(ph_cfg):
            fname = src.get("file", "")
            file_stem = fname.rsplit(".", 1)[0] if "." in fname else fname
            src_data = params_data if "param" in fname else outputs_data
            for col in src.get("columns", []):
                col_id = col["id"]
                cell_key = f"{file_stem}__{col_id}" if idc.get(col_id, 0) > 1 else col_id
                cells[cell_key] = _deep_get(src_data, col.get("source_path", col_id))
    cells["_local"] = {
        "status": rd["local_status"],
        "files_present": rd["local_files_present"],
        "files_expected": rd["local_files_expected"],
        "size_bytes": rd["local_size_bytes"],
    }
    variant_path = _executions_root(pipeline_id) / rd["phase"] / rd["variant"]
    cells["_html_reports"] = [
        {"name": f.name, "url": f"/executions/{rd['phase']}/{rd['variant']}/{f.name}"}
        for f in sorted(variant_path.glob("*.html"))
        if f.is_file()
    ]
    cells["_parent"] = params_data.get("parent")
    cells["_parse_error"] = rd["parse_error"]
    cells["_updated_at"] = rd["updated_at"]

    meta_path = variant_path / "metadata.yaml"
    if meta_path.exists():
        try:
            meta = yaml.safe_load(meta_path.read_text()) or {}
            lifecycle = meta.get("lifecycle_state", "UNKNOWN")
        except Exception:
            lifecycle = "ERROR"
    else:
        lifecycle = "PENDING"
    if lifecycle == "EXECUTION_COMPLETED":
        cells["_execution_status"] = "completed"
    elif lifecycle in ("EXECUTION_FAILED", "ERROR"):
        cells["_execution_status"] = "failed"
    elif lifecycle == "PENDING":
        cells["_execution_status"] = "pending"
    else:
        cells["_execution_status"] = "running"

    return cells


def _cell_matches(cells: dict, col_filters: dict[str, str]) -> bool:
    for key, value in col_filters.items():
        if not value:
            continue
        raw = cells.get(key)
        if isinstance(raw, list):
            text = ", ".join(str(x) for x in raw)
        else:
            text = str(raw) if raw is not None else ""
        if value.lower() not in text.lower():
            return False
    return True


async def get_rows(
    phase: str,
    pipeline_id: str,
    limit: int = 50,
    offset: int = 0,
    q: str = "",
    sort_by: str = "variant",
    sort_dir: str = "asc",
    col_filters: Optional[dict[str, str]] = None,
) -> dict:
    if sort_by not in _ALLOWED_SORT:
        sort_by = "variant"
    if sort_dir not in ("asc", "desc"):
        sort_dir = "asc"

    table_config = _load_table_config(pipeline_id)
    ph_cfg = _phase_cfg(table_config, phase)
    idc = _id_count(ph_cfg)

    where = "WHERE pipeline_id = ? AND phase = ?"
    params: list = [pipeline_id, phase]
    if q:
        where += " AND variant LIKE ?"
        params.append(f"%{q}%")

    active_filters = {k: v for k, v in (col_filters or {}).items() if v}

    async with connect() as db:
        db.row_factory = aiosqlite.Row

        if active_filters:
            raw_all = await db.execute_fetchall(
                f"SELECT * FROM execution_variants {where} ORDER BY {sort_by} {sort_dir}",
                params,
            )
            all_cells = [_build_cells(dict(r), ph_cfg, idc, pipeline_id) for r in raw_all]
            filtered = [c for c in all_cells if _cell_matches(c, active_filters)]
            total = len(filtered)
            rows = filtered[offset: offset + limit]
        else:
            count_rows = await db.execute_fetchall(
                f"SELECT COUNT(*) AS cnt FROM execution_variants {where}", params
            )
            total = count_rows[0]["cnt"] if count_rows else 0
            raw = await db.execute_fetchall(
                f"SELECT * FROM execution_variants {where} "
                f"ORDER BY {sort_by} {sort_dir} LIMIT ? OFFSET ?",
                params + [limit, offset],
            )
            rows = [_build_cells(dict(r), ph_cfg, idc, pipeline_id) for r in raw]

    return {"total": total, "rows": rows}


def get_table_config_for_phase(phase_id: str, pipeline_id: str) -> Optional[dict]:
    return _phase_cfg(_load_table_config(pipeline_id), phase_id)


# ── DVC job queue ─────────────────────────────────────────────────────────────

_job_queue: asyncio.Queue = asyncio.Queue()
_jobs: dict[str, dict] = {}


def get_job(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)


async def enqueue_pull(phase: str, variant: str, pipeline_id: str) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"id": job_id, "type": "pull", "phase": phase,
                     "variant": variant, "pipeline_id": pipeline_id, "status": "queued"}
    await _job_queue.put(job_id)
    return job_id


async def enqueue_delete(phase: str, variant: str, pipeline_id: str) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"id": job_id, "type": "delete", "phase": phase,
                     "variant": variant, "pipeline_id": pipeline_id, "status": "queued"}
    await _job_queue.put(job_id)
    return job_id


async def enqueue_variant_delete(phase: str, variant: str, pipeline_id: str) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"id": job_id, "type": "variant_delete", "phase": phase,
                     "variant": variant, "pipeline_id": pipeline_id, "status": "queued"}
    await _job_queue.put(job_id)
    return job_id


async def _run_pull(phase: str, variant: str, pipeline_id: str) -> None:
    repo = _repo_root(pipeline_id)
    variant_path = _executions_root(pipeline_id) / phase / variant
    dvc_files = list(variant_path.glob("*.dvc"))
    if not dvc_files:
        raise RuntimeError("No .dvc files found")

    dvc_args = " ".join(shlex.quote(str(f)) for f in dvc_files)
    venv_activate = repo / ".venv" / "bin" / "activate"

    parts = []
    if venv_activate.exists():
        parts.append(f"source {venv_activate}")

    user = settings.dagshub_user
    token = settings.dagshub_token
    if user and token:
        parts += [
            "dvc remote modify storage --local auth basic",
            f"dvc remote modify storage --local user {shlex.quote(user)}",
            f"dvc remote modify storage --local password {shlex.quote(token)}",
        ]

    parts.append(f"dvc pull {dvc_args}")
    cmd = " && ".join(parts)

    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(repo),
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(stderr.decode()[:500])


async def _run_delete(phase: str, variant: str, pipeline_id: str) -> None:
    variant_path = _executions_root(pipeline_id) / phase / variant
    for dvc_file in variant_path.glob("*.dvc"):
        try:
            data = yaml.safe_load(dvc_file.read_text()) or {}
            for out in data.get("outs", []):
                artifact = out.get("path")
                if artifact:
                    real = variant_path / artifact
                    if real.exists():
                        real.unlink()
        except Exception as e:
            log.warning("Delete error %s: %s", dvc_file, e)


async def _sh(cmd: str, cwd: Path, env: Optional[dict] = None) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_shell(
        cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd), env=env,
    )
    out, err = await proc.communicate()
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")


async def _delete_variant_via_pr(phase: str, variant: str, pipeline_id: str) -> None:
    """Remove a variant from the upstream repo via branch + PR + squash-merge.

    A plain rmtree() on the local mirror clone (external/.../repo_actions) never
    reaches GitHub — repo_sync_service periodically does `git reset --hard
    origin/{branch}` on that same clone, which would silently resurrect the
    "deleted" variant the next time anything else changes upstream. This uses
    an isolated temp clone (mirroring local_runner_service._publish_pr) so the
    deletion is actually committed, pushed and merged, and so it doesn't race
    with repo_sync_service's background polling on the shared mirror clone.
    """
    proj = get_pipeline_project(pipeline_id)
    repo = proj["repo"]
    base = proj.get("branch", "main")
    token = get_pipeline_token(pipeline_id)
    rel_path = f"executions/{phase}/{variant}"

    env = {**os.environ, "GH_TOKEN": token, "GITHUB_TOKEN": token}
    repo_url = f"https://x-access-token:{token}@github.com/{repo}.git"

    tmp = Path(tempfile.mkdtemp(prefix="variant-delete-"))
    try:
        rc, _, err = await _sh(
            f"git clone --branch {shlex.quote(base)} --single-branch --depth 1 "
            f"{shlex.quote(repo_url)} .",
            tmp, env,
        )
        if rc != 0:
            raise RuntimeError(f"clone failed: {err[:500]}")

        for cmd in [
            'git config user.name "mlops-dashboard[bot]"',
            'git config user.email "mlops-dashboard[bot]@local"',
        ]:
            await _sh(cmd, tmp, env)

        branch = f"mlops/delete-{phase}-{variant}-{int(time.time())}"
        rc, _, err = await _sh(f"git checkout -b {shlex.quote(branch)}", tmp, env)
        if rc != 0:
            raise RuntimeError(f"checkout -b failed: {err[:500]}")

        await _sh(f"git rm -r --ignore-unmatch -- {shlex.quote(rel_path)}", tmp, env)

        rc, _, _ = await _sh("git diff --cached --quiet", tmp, env)
        if rc == 0:
            log.info("Nothing to delete upstream for %s/%s/%s (local-only variant)", pipeline_id, phase, variant)
            return

        msg = f"Delete variant {phase}/{variant}"
        rc, _, err = await _sh(f"git commit -m {shlex.quote(msg)}", tmp, env)
        if rc != 0:
            raise RuntimeError(f"commit failed: {err[:500]}")

        pushed = False
        for attempt in range(1, 4):
            rc, _, err = await _sh(f"git push origin {shlex.quote(branch)}", tmp, env)
            if rc == 0:
                pushed = True
                break
            await asyncio.sleep(attempt * 3)
        if not pushed:
            raise RuntimeError(f"push failed: {err[:500]}")

        pr_title = f"Delete variant {phase}/{variant}"
        pr_body = f"PR automática para eliminar la variante **{variant}** de la fase **{phase}**."
        rc, out, err = await _sh(
            f'gh api -X POST repos/{repo}/pulls '
            f'-f title={shlex.quote(pr_title)} -f body={shlex.quote(pr_body)} '
            f'-f base={shlex.quote(base)} -f head={shlex.quote(branch)} --jq ".number"',
            tmp, env,
        )
        pr_number = out.strip()
        if rc != 0 or not pr_number:
            raise RuntimeError(f"PR creation failed: {err[:500]}")

        merged = False
        for attempt in range(1, 6):
            rc, _, err = await _sh(
                f"gh pr merge {pr_number} --squash --delete-branch --repo {repo}", tmp, env,
            )
            if rc == 0:
                merged = True
                break
            await asyncio.sleep(attempt * 3)
        if not merged:
            raise RuntimeError(f"PR #{pr_number} merge failed: {err[:500]}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


async def _run_variant_delete(phase: str, variant: str, pipeline_id: str) -> None:
    """Delete a variant. Doesn't require the local mirror folder to still
    exist — it may already be gone (a previously-failed delete that removed
    the folder but errored before clearing the DB row, or a reset --hard that
    picked up someone else's deletion). Always attempts the upstream removal
    and always clears the DB row, so retrying on a "ghost" row recovers it
    instead of permanently failing with "Variant not found"."""
    variant_path = _executions_root(pipeline_id) / phase / variant

    await _delete_variant_via_pr(phase, variant, pipeline_id)

    if variant_path.exists():
        shutil.rmtree(variant_path)

    variant_id = f"{pipeline_id}/{phase}/{variant}"
    async with connect() as db:
        await db.execute("DELETE FROM execution_variants WHERE id = ?", (variant_id,))
        await db.commit()


async def _worker() -> None:
    while True:
        job_id = await _job_queue.get()
        job = _jobs.get(job_id)
        if not job:
            continue
        job["status"] = "running"
        pipeline_id = job["pipeline_id"]
        try:
            if job["type"] == "pull":
                await _run_pull(job["phase"], job["variant"], pipeline_id)
            elif job["type"] == "delete":
                await _run_delete(job["phase"], job["variant"], pipeline_id)
            elif job["type"] == "variant_delete":
                await _run_variant_delete(job["phase"], job["variant"], pipeline_id)
            job["status"] = "done"
        except Exception as e:
            job["status"] = "failed"
            job["error"] = str(e)
            log.error("DVC job %s failed: %s", job_id, e)
        finally:
            # variant_delete removes the directory and cleans SQLite itself
            if job.get("type") != "variant_delete":
                await sync_variant(job["phase"], job["variant"], pipeline_id)


def start_worker() -> asyncio.Task:
    return asyncio.create_task(_worker())
