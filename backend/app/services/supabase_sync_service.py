import asyncio
import json
import logging

import httpx

from app.core.config import settings, load_pipelines_config
from app.core.db import connect

log = logging.getLogger(__name__)

_ref_counter = 0


async def enrich_workflow_run(run_id: str, fase: str, variant: str) -> bool:
    """Add metadata known by the dispatcher before GitHub job logs are available."""
    if not settings.supabase_url or not settings.service_role_key:
        return False
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/workflow_runs"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.patch(
                url,
                params={"run_id": f"eq.{run_id}"},
                headers={
                    "apikey": settings.service_role_key,
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json={"fase": fase, "variant": variant},
            )
        if response.is_success:
            return True
        log.warning(
            "supabase_sync: metadata patch failed run=%s status=%s body=%s",
            run_id, response.status_code, response.text[:300],
        )
    except Exception as exc:
        log.warning("supabase_sync: metadata patch failed run=%s: %s", run_id, exc)
    return False


def _next_ref() -> str:
    global _ref_counter
    _ref_counter += 1
    return str(_ref_counter)


def _resolve_pipeline(repo: str, branch: str) -> str | None:
    """Match a Supabase workflow_runs record (repo+branch) to a pipeline_id."""
    for pid, proj in load_pipelines_config().items():
        if proj.get("repo", "").lower() == repo.lower() and proj.get("branch", "") == branch:
            return pid
    return None


async def _resolve_pipeline_for_run(repo: str, branch: str, run_id: str | int | None) -> str | None:
    """Resolve repository_dispatch runs by local gh_run_id before using head_branch.

    GitHub reports the workflow file branch (usually main) in workflow_run.head_branch,
    not the checkout_branch carried in repository_dispatch.client_payload.
    """
    if run_id:
        async with connect() as db:
            async with db.execute(
                "SELECT pipeline_id FROM executions WHERE gh_run_id=? LIMIT 1",
                (str(run_id),),
            ) as cursor:
                row = await cursor.fetchone()
        if row:
            return row[0]
    return _resolve_pipeline(repo, branch)


def _resolve_fase_prefix(pipeline_id: str, prefix: str) -> str:
    """Resolve a fase prefix (f01, f02…) to the full fase ID using fase_runners.yaml.

    Falls back to the prefix itself if no match is found.
    """
    from app.core.config import fase_runners_path
    import yaml

    path = fase_runners_path(pipeline_id)
    if not path.exists():
        return prefix
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    for entry in data.get("fases", []):
        fase_id = entry.get("fase", "")
        if fase_id.startswith(prefix):
            return fase_id
    return prefix


async def _connect(force_pull_fn) -> None:
    import websockets

    base = (settings.supabase_url or "").rstrip("/").replace("https://", "wss://")
    key = settings.supabase_publishable_key or ""
    ws_url = f"{base}/realtime/v1/websocket?apikey={key}&vsn=1.0.0"

    async with websockets.connect(ws_url, ping_interval=25) as ws:
        join_ref = _next_ref()
        await ws.send(json.dumps({
            "topic": "realtime:public:workflow_runs",
            "event": "phx_join",
            "payload": {
                "config": {
                    "postgres_changes": [
                        {"event": "*", "schema": "public", "table": "workflow_runs"}
                    ]
                },
                "access_token": key,
            },
            "ref": join_ref,
            "join_ref": join_ref,
        }))
        log.info("supabase_sync: listening for workflow_runs changes")

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("event") != "postgres_changes":
                continue
            data = msg.get("payload", {}).get("data", {})
            record = data.get("new", data.get("record", {}))

            run_id = record.get("run_id")
            repo = record.get("repo", "")
            branch = record.get("branch", "")
            fase_raw = record.get("fase", "")

            if run_id and repo:
                from app.services.github import notify_workflow_run
                notify_workflow_run(repo, str(run_id), record.get("created_at", ""))

            if run_id and record.get("status") == "in_progress":
                from app.services.execution_service import update_running_from_gh_run
                asyncio.create_task(update_running_from_gh_run(str(run_id)))

            conclusion = record.get("conclusion")
            if conclusion is None:
                continue

            pipeline_id = await _resolve_pipeline_for_run(repo, branch, run_id)
            if pipeline_id:
                fase = _resolve_fase_prefix(pipeline_id, fase_raw) if fase_raw else None
                log.info(
                    "supabase_sync: run %s completed (%s) repo=%s branch=%s → pipeline=%s fase=%s",
                    run_id, conclusion, repo, branch, pipeline_id, fase,
                )
                asyncio.create_task(force_pull_fn(pipeline_id))
            else:
                log.warning(
                    "supabase_sync: run %s completed (%s) repo=%s branch=%s — no matching pipeline",
                    run_id, conclusion, repo, branch,
                )

            if run_id and conclusion:
                from app.services.execution_service import update_from_gh_run
                asyncio.create_task(update_from_gh_run(str(run_id), conclusion))


async def listen_workflow_runs(force_pull_fn) -> None:
    if not settings.supabase_url or not settings.supabase_publishable_key:
        log.info("supabase_sync: Supabase not configured, listener disabled")
        return
    while True:
        try:
            await _connect(force_pull_fn)
        except Exception as exc:
            log.warning("supabase_sync: connection lost (%s), reconnecting in 30s", exc)
            await asyncio.sleep(30)
