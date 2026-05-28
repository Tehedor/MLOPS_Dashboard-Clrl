import glob
import json
import logging
import re
import uuid
import asyncio
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite
import yaml

log = logging.getLogger(__name__)
POLL_GH_SECS = 10

from app.core.config import phases_runner_path, load_app_config, PROJECT_ROOT
from app.core.db import DB_PATH
from app.schemas.execution import Execution, ExecutionCreate, ExecutionStatus
from app.services.github import dispatch_phase


_FASE_CONFIG_CACHE: dict | None = None

POLL_PARENT_SECS = 30
POLL_RUNNER_SECS = 15


def _normalize_variant(fase: str, variant: str) -> str:
    """Convierte '2129' → 'v1_2129' usando el dígito de fase de fase_id."""
    if re.match(r'^v\d_\d{4}$', variant):
        return variant
    m = re.match(r'^v?(\d{1,4})$', variant.strip())
    if m:
        fm = re.search(r'\d{2}', fase)
        if fm:
            phase_digit = int(fm.group())
            return f"v{phase_digit}_{int(m.group(1)):04d}"
    return variant


def _load_phases_config() -> dict:
    config_path = phases_runner_path()
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
        return {
            f["fase"]: {
                "runner":          f["runner"],
                "gh_fase":         f.get("gh_fase", f["fase"]),
                "parent_required": f.get("parent_required", False),
            }
            for f in config.get("fases", [])
        }
    except Exception as e:
        print(f"Warning: Failed to load phases config: {e}")
        return {}


def _get_fase_config() -> dict:
    global _FASE_CONFIG_CACHE
    if _FASE_CONFIG_CACHE is None:
        _FASE_CONFIG_CACHE = _load_phases_config()
    return _FASE_CONFIG_CACHE


def _get_runner_json(runner_name: str) -> str | None:
    """Devuelve el runner_json para fromJSON(inputs.runner) de GHA."""
    if runner_name.strip().startswith('['):
        return runner_name.strip()
    config_path = phases_runner_path()
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
        for item in config.get("runners", []):
            name = next((k for k in item if k not in ('max-parallel', 'labels', 'runs-on')), None)
            if name == runner_name:
                labels = item.get("runs-on", item.get("labels", []))
                return json.dumps(labels)
    except Exception:
        pass
    return None


def _runner_max_parallel(runner_name: str) -> int:
    config_path = phases_runner_path()
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
        for item in config.get("runners", []):
            name = next((k for k in item if k not in ('max-parallel', 'labels', 'runs-on')), None)
            if name == runner_name:
                return item.get("max-parallel", 1)
    except Exception:
        pass
    return 1


def _executions_base_path() -> Path:
    cfg = load_app_config()
    p = Path(cfg.get("actions_repo_path_executions", "external/repo_actions/executions"))
    return p if p.is_absolute() else PROJECT_ROOT / p


def _parent_fase_dir(parent_variant: str) -> Path | None:
    """'v1_5001' → Path(.../executions/f01_explore)"""
    m = re.match(r'^v(\d+)_', parent_variant)
    if not m:
        return None
    digit = int(m.group(1))
    base = _executions_base_path()
    matches = glob.glob(str(base / f"f{digit:02d}_*"))
    return Path(matches[0]) if matches else None


def _single_parent_exists(parent: str) -> bool:
    fase_dir = _parent_fase_dir(parent)
    if not fase_dir:
        return False
    metadata_path = fase_dir / parent / "metadata.yaml"
    if not metadata_path.exists():
        return False
    try:
        with open(metadata_path) as f:
            data = yaml.safe_load(f) or {}
        return data.get("lifecycle_state") == "EXECUTION_COMPLETED"
    except Exception:
        return False


def _parent_exists(ex: Execution, phase_requires_parent: bool) -> bool:
    if not phase_requires_parent or not ex.parent:
        return True
    parent = ex.parent.strip()
    if parent.startswith('['):
        try:
            parents = json.loads(parent)
        except Exception:
            return False
        return all(_single_parent_exists(str(p)) for p in parents)
    return _single_parent_exists(parent)


def _row_to_execution(row) -> Execution:
    return Execution(
        id=row[0],
        fase=row[1],
        variant=row[2],
        parent=row[3],
        runner=row[4],
        params=json.loads(row[5]),
        status=ExecutionStatus(row[6]),
        error_code=row[7],
        gh_run_id=row[8],
        created_at=row[9],
        updated_at=row[10],
    )


class ExecutionService:
    def __init__(self):
        self._paused: bool = False

    async def create(self, body: ExecutionCreate) -> Execution:
        from fastapi import HTTPException
        normalized = _normalize_variant(body.fase, body.variant)
        blocked_statuses = ('queued', 'waiting_parent', 'waiting_runner', 'dispatching', 'running')
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                f"SELECT status FROM executions WHERE fase=? AND variant=? AND status IN ({','.join('?'*len(blocked_statuses))})",
                (body.fase, normalized, *blocked_statuses),
            ) as cursor:
                existing = await cursor.fetchone()
        if existing:
            raise HTTPException(409, f"{body.fase}/{normalized} ya tiene un despacho en curso (estado: {existing[0]}).")

        now = datetime.now(timezone.utc).isoformat()
        ex = Execution(
            id=str(uuid.uuid4()),
            fase=body.fase,
            variant=normalized,
            parent=body.parent,
            runner=body.selected_runner or _get_fase_config().get(body.fase, {}).get("runner", "GithubActions"),
            params=body.params,
            status=ExecutionStatus.queued,
            created_at=now,
            updated_at=now,
        )
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO executions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    ex.id, ex.fase, ex.variant, ex.parent, ex.runner,
                    json.dumps(ex.params), ex.status.value, ex.error_code,
                    ex.gh_run_id, ex.created_at, ex.updated_at,
                ),
            )
            await db.commit()
        asyncio.create_task(self._dispatch(ex))
        return ex

    async def _runner_has_slot(self, runner_name: str) -> bool:
        max_parallel = _runner_max_parallel(runner_name)
        active = ('running', 'dispatching', 'waiting_runner')
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                f"SELECT COUNT(*) FROM executions WHERE runner=? AND status IN ({','.join('?'*len(active))})",
                (runner_name, *active),
            ) as cursor:
                row = await cursor.fetchone()
        return (row[0] if row else 0) < max_parallel

    async def _dispatch(self, ex: Execution) -> None:
        fase_cfg = _get_fase_config().get(ex.fase, {})
        parent_required = fase_cfg.get("parent_required", False)

        # 1. Esperar parent
        if not _parent_exists(ex, parent_required):
            await self._update_status(ex.id, ExecutionStatus.waiting_parent)
            while True:
                await asyncio.sleep(POLL_PARENT_SECS)
                current = await self.get(ex.id)
                if current is None or current.status == ExecutionStatus.canceled:
                    return
                if _parent_exists(ex, parent_required):
                    break

        # 2. Esperar slot de runner
        if not await self._runner_has_slot(ex.runner):
            await self._update_status(ex.id, ExecutionStatus.waiting_runner)
            while True:
                await asyncio.sleep(POLL_RUNNER_SECS)
                current = await self.get(ex.id)
                if current is None or current.status == ExecutionStatus.canceled:
                    return
                if await self._runner_has_slot(ex.runner):
                    break

        # 3. Gate de pausa — esperar si la cola está pausada
        while self._paused:
            await asyncio.sleep(5)
            current = await self.get(ex.id)
            if current is None or current.status == ExecutionStatus.canceled:
                return

        # 4. Despachar
        if ex.runner == "Local":
            await self._dispatch_local(ex)
            return
        try:
            await self._update_status(ex.id, ExecutionStatus.dispatching)
            gh_fase     = fase_cfg.get("gh_fase", ex.fase)
            runner_json = _get_runner_json(ex.runner)
            gh_run_id   = await dispatch_phase(gh_fase, ex.variant, ex.parent, ex.params, runner_json)
            if gh_run_id:
                await self._set_gh_run_id(ex.id, gh_run_id)
            await self._update_status(ex.id, ExecutionStatus.running)
        except Exception:
            await self._update_status(ex.id, ExecutionStatus.failed, "DISPATCH_ERROR")

    async def _dispatch_local(self, ex: Execution) -> None:
        from app.services.local_runner_service import run_local_phase
        from app.services import local_log_store as log_store
        try:
            await self._update_status(ex.id, ExecutionStatus.dispatching)
            await self._update_status(ex.id, ExecutionStatus.running)
            success = await run_local_phase(ex)
            status = ExecutionStatus.success if success else ExecutionStatus.failed
            error = None if success else "LOCAL_STEP_FAILED"
            await self._update_status(ex.id, status, error)
        except Exception as e:
            print(f"[local-runner] unhandled exception: {e}")
            log_store.push(ex.id, "error", f"[fatal] {e}")
            await self._update_status(ex.id, ExecutionStatus.failed, "LOCAL_ERROR")
        finally:
            log_store.close(ex.id)

    async def _set_gh_run_id(self, execution_id: str, gh_run_id: str) -> None:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE executions SET gh_run_id=? WHERE id=?",
                (gh_run_id, execution_id),
            )
            await db.commit()

    async def _update_status(
        self, execution_id: str, status: ExecutionStatus, error_code: str | None = None
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE executions SET status=?, error_code=?, updated_at=? WHERE id=?",
                (status.value, error_code, now, execution_id),
            )
            await db.commit()
        _TERMINAL = {ExecutionStatus.success, ExecutionStatus.failed, ExecutionStatus.canceled}
        if status in _TERMINAL:
            from app.services import repo_sync_service
            asyncio.create_task(repo_sync_service.force_pull())

    async def list_all(self) -> list[Execution]:
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                "SELECT * FROM executions ORDER BY created_at DESC"
            ) as cursor:
                rows = await cursor.fetchall()
        return [_row_to_execution(r) for r in rows]

    async def get(self, execution_id: str) -> Execution | None:
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                "SELECT * FROM executions WHERE id=?", (execution_id,)
            ) as cursor:
                row = await cursor.fetchone()
        return _row_to_execution(row) if row else None

    async def reconcile_stale(self) -> None:
        """Al arrancar, sincroniza registros activos contra la GH API y reactiva los waiting."""
        from app.services.github import fetch_run_status

        # Sincronizar contra GH los que estaban en vuelo
        stale = ('running', 'dispatching', 'queued')
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                f"SELECT id, gh_run_id FROM executions WHERE status IN ({','.join('?'*len(stale))})",
                stale,
            ) as cursor:
                rows = await cursor.fetchall()

        for execution_id, gh_run_id in rows:
            if not gh_run_id:
                await self._update_status(execution_id, ExecutionStatus.failed, "INTERRUPTED")
                continue
            run_info = await fetch_run_status(gh_run_id)
            if run_info is None:
                await self._update_status(execution_id, ExecutionStatus.failed, "INTERRUPTED")
                continue
            gh_status     = run_info.get("status")
            gh_conclusion = run_info.get("conclusion")
            if gh_status == "completed":
                if gh_conclusion == "success":
                    await self._update_status(execution_id, ExecutionStatus.success)
                elif gh_conclusion in ("cancelled", "skipped"):
                    await self._update_status(execution_id, ExecutionStatus.canceled)
                else:
                    await self._update_status(
                        execution_id, ExecutionStatus.failed,
                        f"GH_{(gh_conclusion or 'unknown').upper()}"
                    )

        # Reactivar los waiting_* cuya tarea asyncio se perdió al reiniciar
        waiting = ('waiting_parent', 'waiting_runner')
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute(
                f"SELECT * FROM executions WHERE status IN ({','.join('?'*len(waiting))})",
                waiting,
            ) as cursor:
                waiting_rows = await cursor.fetchall()

        for row in waiting_rows:
            ex = _row_to_execution(row)
            asyncio.create_task(self._dispatch(ex))

    async def cancel(self, execution_id: str) -> Execution:
        ex = await self.get(execution_id)
        if not ex:
            from fastapi import HTTPException
            raise HTTPException(404, "Not found")

        # Kill the actual running execution before updating the DB status.
        # For waiting_* states the _dispatch loop already polls the DB and
        # will exit on its own once we flip the status below.
        if ex.runner == "Local":
            from app.services.local_runner_service import kill as kill_local
            kill_local(execution_id)
        elif ex.gh_run_id and ex.status.value in ("running", "dispatching"):
            from app.services.github import cancel_run
            try:
                await cancel_run(ex.gh_run_id)
            except Exception as e:
                log.warning("Failed to cancel GH run %s: %s", ex.gh_run_id, e)

        await self._update_status(execution_id, ExecutionStatus.canceled)
        return await self.get(execution_id)

    async def retry(self, execution_id: str) -> Execution:
        ex = await self.get(execution_id)
        if not ex:
            from fastapi import HTTPException
            raise HTTPException(404, "Not found")
        await self._update_status(execution_id, ExecutionStatus.queued, None)
        updated = await self.get(execution_id)
        asyncio.create_task(self._dispatch(updated))
        return updated


# ── GitHub run status sync ────────────────────────────────────────────────────

async def update_from_gh_run(gh_run_id: str, conclusion: str) -> bool:
    """Update local execution status from a completed GitHub run.

    Matches by gh_run_id so it works even when the trigger fails and
    the Supabase record has NULL fase/variant. Returns True if matched.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT id FROM executions WHERE gh_run_id=? AND status NOT IN ('success','failed','canceled')",
            (str(gh_run_id),),
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return False
    execution_id = row[0]
    if conclusion == "success":
        new_status, error_code = ExecutionStatus.success, None
    elif conclusion in ("cancelled", "skipped"):
        new_status, error_code = ExecutionStatus.canceled, None
    else:
        new_status, error_code = ExecutionStatus.failed, f"GH_{conclusion.upper()}"
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE executions SET status=?, error_code=?, updated_at=? WHERE id=?",
            (new_status.value, error_code, now, execution_id),
        )
        await db.commit()
    _TERMINAL = {ExecutionStatus.success, ExecutionStatus.failed, ExecutionStatus.canceled}
    if new_status in _TERMINAL:
        from app.services import repo_sync_service
        asyncio.create_task(repo_sync_service.force_pull())
    log.info("update_from_gh_run: %s → %s (%s)", gh_run_id, new_status.value, error_code)
    return True


async def _check_run(gh_run_id: str) -> None:
    from app.services.github import fetch_run_status
    try:
        run_info = await fetch_run_status(gh_run_id)
        if run_info is None or run_info.get("status") != "completed":
            return
        conclusion = run_info.get("conclusion") or "failure"
        await update_from_gh_run(gh_run_id, conclusion)
    except Exception as exc:
        log.warning("check_run %s: %s", gh_run_id, exc)


async def _poll_gh_running() -> None:
    """Background task: poll GitHub API every POLL_GH_SECS for running executions.
    Fallback for when Supabase realtime is unavailable."""
    while True:
        await asyncio.sleep(POLL_GH_SECS)
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                # Ejecuciones con run_id conocido → verificar estado en GH
                async with db.execute(
                    "SELECT gh_run_id FROM executions WHERE status='running' AND gh_run_id IS NOT NULL"
                ) as cursor:
                    rows = await cursor.fetchall()
                # Ejecuciones sin run_id que llevan >30 min → marcar INTERRUPTED
                async with db.execute(
                    """SELECT id FROM executions
                       WHERE status='running' AND gh_run_id IS NULL
                       AND updated_at < datetime('now', '-30 minutes')"""
                ) as cursor:
                    orphans = await cursor.fetchall()
            if rows:
                await asyncio.gather(*(_check_run(r[0]) for r in rows))
            for (eid,) in orphans:
                log.warning("poll_gh_running: execution %s sin run_id tras 30 min → INTERRUPTED", eid)
                now = datetime.now(timezone.utc).isoformat()
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute(
                        "UPDATE executions SET status='failed', error_code='INTERRUPTED', updated_at=? WHERE id=?",
                        (now, eid),
                    )
                    await db.commit()
        except Exception as exc:
            log.warning("poll_gh_running: %s", exc)


def start_gh_poll() -> asyncio.Task:
    return asyncio.create_task(_poll_gh_running())
