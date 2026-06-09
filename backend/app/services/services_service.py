import asyncio
import logging
import os
from pathlib import Path

import httpx
import yaml

from app.core.config import load_app_config, PROJECT_ROOT, resolve_pipeline_config_path

log = logging.getLogger(__name__)

SERVICES_CWD = PROJECT_ROOT / "services"


def _load_services_config(pipeline_id: str) -> dict:
    path = resolve_pipeline_config_path(pipeline_id, "services_external_ctrl", "config/services_external_ctrl.yaml")
    if not path.exists():
        return {}
    with open(path) as f:
        return yaml.safe_load(f) or {}


def get_services(pipeline_id: str) -> list[dict]:
    data = _load_services_config(pipeline_id)
    result = []
    for service_id, cfg in data.get("Services", {}).items():
        if not cfg.get("enabled", True):
            continue
        entry = {
            "id": service_id,
            "port": cfg.get("port"),
            "fases": cfg.get("fases", []),
            "commands": cfg.get("commands", []),
            "url_repo": cfg.get("url_repo", ""),
        }
        if "variant_env_var" in cfg:
            entry["variant_env_var"] = cfg["variant_env_var"]
        if "variant_format" in cfg:
            entry["variant_format"] = cfg["variant_format"]
        result.append(entry)
    return result


def get_service(service_id: str, pipeline_id: str) -> dict | None:
    data = _load_services_config(pipeline_id)
    cfg = data.get("Services", {}).get(service_id)
    if not cfg:
        return None
    entry = {
        "id": service_id,
        "port": cfg.get("port"),
        "fases": cfg.get("fases", []),
        "commands": cfg.get("commands", []),
        "url_repo": cfg.get("url_repo", ""),
    }
    if "variant_env_var" in cfg:
        entry["variant_env_var"] = cfg["variant_env_var"]
    if "variant_format" in cfg:
        entry["variant_format"] = cfg["variant_format"]
    return entry


async def run_make_command(command: str, env_vars: dict[str, str]) -> dict:
    if not SERVICES_CWD.exists():
        return {"ok": False, "error": f"services dir not found: {SERVICES_CWD}"}

    full_env = {**os.environ, **env_vars}

    try:
        proc = await asyncio.create_subprocess_exec(
            "make", command,
            cwd=str(SERVICES_CWD),
            env=full_env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode == 0:
            return {"ok": True, "output": stdout.decode()}
        return {"ok": False, "error": (stderr.decode() or stdout.decode()).strip()}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "command timed out after 60s"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def check_status(port: int) -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"http://localhost:{port}")
            return r.status_code < 500
    except Exception:
        return False
