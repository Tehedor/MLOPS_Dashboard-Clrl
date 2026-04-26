from functools import lru_cache
from pathlib import Path

import yaml
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    github_token: str = ""
    github_repo: str = "Tehedor/MLOps_actions_v2"
    database_url: str = "executions.db"
    queue_limit: int = 50
    dagshub_user: str = ""
    dagshub_token: str = ""
    supabase_url: str = ""
    supabase_publishable_key: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


PROJECT_ROOT = Path(__file__).resolve().parents[3]
APP_CONFIG_PATH = PROJECT_ROOT / "config.yaml"


@lru_cache(maxsize=1)
def load_app_config() -> dict:
    if not APP_CONFIG_PATH.exists():
        return {}

    with open(APP_CONFIG_PATH) as f:
        data = yaml.safe_load(f) or {}

    return data if isinstance(data, dict) else {}


def phases_runner_path() -> Path:
    app_config = load_app_config()
    configured_path = str(app_config.get("phases_runner", "config/fases_execution_runners.yaml"))

    candidate = Path(configured_path)
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate

    if candidate.exists():
        return candidate

    # Backward compatibility with old backend-local path.
    return PROJECT_ROOT / "backend" / "config" / "fases_execution_runners.yaml"
