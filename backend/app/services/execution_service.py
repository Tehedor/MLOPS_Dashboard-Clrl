import json
import uuid
import asyncio
from datetime import datetime, timezone

import aiosqlite

from app.core.db import DB_PATH
from app.schemas.execution import Execution, ExecutionCreate, ExecutionStatus
from app.services.github import dispatch_phase

FASE_RUNNER: dict[str, str] = {
    "f01_explore": "GithubActions",
    "f02_events": "GithubActions",
    "f03_windows": "GithubActions",
    "f04_targets": "GithubActions",
    "f05_modeling": "GPU-self-hosted",
    "f06_quant": "GithubActions",
    "f07_modval": "ESP32-self-hosted",
    "f08_sysval": "GithubActions",
}


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
        now = datetime.now(timezone.utc).isoformat()
        ex = Execution(
            id=str(uuid.uuid4()),
            fase=body.fase,
            variant=body.variant,
            parent=body.parent,
            runner=FASE_RUNNER.get(body.fase, "GithubActions"),
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
            await dispatch_phase(ex.fase, ex.variant, ex.parent, ex.params)
            await self._update_status(ex.id, ExecutionStatus.running)
        except Exception:
            await self._update_status(ex.id, ExecutionStatus.failed, "DISPATCH_ERROR")

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
