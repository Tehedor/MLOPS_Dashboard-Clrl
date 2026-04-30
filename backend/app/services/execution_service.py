import json
import re
import uuid
import asyncio
from datetime import datetime, timezone

import aiosqlite
import yaml

from app.core.config import phases_runner_path
from app.core.db import DB_PATH
from app.schemas.execution import Execution, ExecutionCreate, ExecutionStatus
from app.services.github import dispatch_phase


_FASE_CONFIG_CACHE: dict | None = None


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
                "runner":  f["runner"],
                "gh_fase": f.get("gh_fase", f["fase"]),
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
        return runner_name.strip()  # ya es un JSON array válido
    config_path = phases_runner_path()
    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
        for item in config.get("runners", []):
            name = next((k for k in item if k not in ('max-parallel', 'labels')), None)
            if name == runner_name:
                labels = item.get("labels", [])
                return json.dumps(labels[0] if len(labels) == 1 else labels)
    except Exception:
        pass
    return None


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
    async def create(self, body: ExecutionCreate) -> Execution:
        from fastapi import HTTPException
        normalized = _normalize_variant(body.fase, body.variant)
        # Solo bloqueamos estados pre-despacho fiables en SQLite local.
        # 'running' no se bloquea: el local se queda en running permanentemente
        # (los updates de success/failed van a Supabase, nunca al local).
        blocked_statuses = ('queued', 'waiting_parent', 'dispatching')
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

    async def _dispatch(self, ex: Execution) -> None:
        try:
            await self._update_status(ex.id, ExecutionStatus.dispatching)
            gh_fase    = _get_fase_config().get(ex.fase, {}).get("gh_fase", ex.fase)
            runner_json = _get_runner_json(ex.runner)
            gh_run_id  = await dispatch_phase(gh_fase, ex.variant, ex.parent, ex.params, runner_json)
            if gh_run_id:
                await self._set_gh_run_id(ex.id, gh_run_id)
            await self._update_status(ex.id, ExecutionStatus.running)
        except Exception:
            await self._update_status(ex.id, ExecutionStatus.failed, "DISPATCH_ERROR")

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
        """Al arrancar, sincroniza registros running/dispatching/queued contra la GH API."""
        from app.services.github import fetch_run_status
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
            gh_status = run_info.get("status")
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
            # in_progress/queued en GH → dejar como running (sigue activo)

    async def cancel(self, execution_id: str) -> Execution:
        ex = await self.get(execution_id)
        if not ex:
            from fastapi import HTTPException
            raise HTTPException(404, "Not found")
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
