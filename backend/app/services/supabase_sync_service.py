import asyncio
import json
import logging

from app.core.config import settings

log = logging.getLogger(__name__)

_ref_counter = 0


def _next_ref() -> str:
    global _ref_counter
    _ref_counter += 1
    return str(_ref_counter)


async def _connect(callback) -> None:
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
                        {"event": "UPDATE", "schema": "public", "table": "workflow_runs"}
                    ]
                },
                "access_token": key,
            },
            "ref": join_ref,
            "join_ref": join_ref,
        }))
        log.info("supabase_sync: listening for completed workflow_runs")

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("event") != "postgres_changes":
                continue
            data = msg.get("payload", {}).get("data", {})
            record = data.get("new", data.get("record", {}))
            if record.get("conclusion") is not None:
                log.info("supabase_sync: run %s completed → force pull", record.get("run_id"))
                asyncio.create_task(callback())


async def listen_completions(callback) -> None:
    if not settings.supabase_url or not settings.supabase_publishable_key:
        log.info("supabase_sync: Supabase not configured, listener disabled")
        return
    while True:
        try:
            await _connect(callback)
        except Exception as exc:
            log.warning("supabase_sync: connection lost (%s), reconnecting in 30s", exc)
            await asyncio.sleep(30)
