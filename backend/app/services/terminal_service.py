import os
import re
from functools import lru_cache
from pathlib import Path

from app.core.config import load_app_config

_active_sessions: dict[str, int] = {}
_ENV_VAR_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def _load_dotenv_values() -> dict[str, str]:
    if not _ENV_PATH.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in _ENV_PATH.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


_DOTENV_VALUES = _load_dotenv_values()


def _resolve(value: str) -> str:
    if _ENV_VAR_RE.match(value):
        return os.environ.get(value, _DOTENV_VALUES.get(value, ""))
    return value


@lru_cache(maxsize=1)
def _load_runners() -> dict:
    config = load_app_config()
    raw = config.get("TERMINAL_RUNNERS", {}) or {}
    result = {}
    for runner_id, cfg in raw.items():
        result[runner_id] = {
            "url": _resolve(str(cfg.get("url", ""))),
            "username": _resolve(str(cfg.get("username", ""))),
            "password": _resolve(str(cfg.get("password", ""))),
        }
    return result


def get_runners() -> dict:
    return _load_runners()


def runner_ws_url(runner_id: str) -> str:
    url = get_runners()[runner_id]["url"].rstrip("/")
    if url.startswith("https://"):
        url = "wss://" + url[8:]
    elif url.startswith("http://"):
        url = "ws://" + url[7:]
    return url + "/ws"


def runner_credentials(runner_id: str) -> tuple[str, str]:
    cfg = get_runners()[runner_id]
    return cfg["username"], cfg["password"]


def session_increment(runner_id: str) -> None:
    _active_sessions[runner_id] = _active_sessions.get(runner_id, 0) + 1


def session_decrement(runner_id: str) -> None:
    _active_sessions[runner_id] = max(0, _active_sessions.get(runner_id, 0) - 1)


def session_count(runner_id: str) -> int:
    return _active_sessions.get(runner_id, 0)
