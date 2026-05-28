import asyncio
import base64
import json
from typing import Optional

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import BaseModel
import websockets

from app.services.terminal_service import (
    get_runner_env_config,
    get_runners,
    runner_credentials,
    runner_ws_url,
    session_decrement,
    session_increment,
    session_count,
    update_runner_env,
)

rest_router = APIRouter()
ws_router = APIRouter()


def _basic_auth(username: str, password: str) -> str:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {token}"


@rest_router.get("")
def list_runners():
    return [
        {"id": rid, "label": rid, "active_sessions": session_count(rid)}
        for rid in get_runners()
    ]


@rest_router.get("/config")
def get_config():
    return get_runner_env_config()


class RunnerEnvUpdate(BaseModel):
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


@rest_router.patch("/{runner_id}/config")
def patch_runner_config(runner_id: str, body: RunnerEnvUpdate):
    try:
        update_runner_env(runner_id, body.url, body.username, body.password)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@ws_router.websocket("/{runner_id}")
async def terminal_ws(websocket: WebSocket, runner_id: str):
    if runner_id not in get_runners():
        await websocket.close(code=4004, reason="Runner not found")
        return

    await websocket.accept()
    session_increment(runner_id)

    try:
        username, password = runner_credentials(runner_id)
        ws_url = runner_ws_url(runner_id)
        auth_token = base64.b64encode(f"{username}:{password}".encode()).decode()

        async with websockets.connect(
            ws_url,
            additional_headers={"Authorization": _basic_auth(username, password)},
            subprotocols=["tty"],
            ping_interval=20,
            open_timeout=10,
        ) as runner_ws:
            auth_sent = False

            async def send_auth_payload(payload: str) -> None:
                nonlocal auth_sent
                if auth_sent:
                    await runner_ws.send(payload)
                    return

                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    await runner_ws.send(payload)
                    return

                if not isinstance(data, dict):
                    await runner_ws.send(payload)
                    return

                data["AuthToken"] = auth_token
                await runner_ws.send(json.dumps(data))
                auth_sent = True

            async def to_runner():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg.get("type") == "websocket.disconnect":
                            break
                        if msg.get("bytes") is not None:
                            await runner_ws.send(msg["bytes"])
                        elif msg.get("text") is not None:
                            await send_auth_payload(msg["text"])
                except Exception:
                    pass

            async def from_runner():
                try:
                    async for msg in runner_ws:
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except Exception:
                    pass

            tasks = [
                asyncio.create_task(to_runner()),
                asyncio.create_task(from_runner()),
            ]
            _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass

    except Exception as exc:
        err = str(exc).replace('"', "'")
        try:
            msg = f"\x1b[31mError al conectar con {runner_id}: {err}\x1b[0m\r\n"
            await websocket.send_text(msg)
        except Exception:
            pass
    finally:
        session_decrement(runner_id)
        try:
            await websocket.close()
        except Exception:
            pass
