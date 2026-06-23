import os
from functools import lru_cache
from pathlib import Path

import yaml
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parents[3]

# In pydantic-settings v2 the last file wins on conflict.
# config/.env is the fallback; root .env is the authoritative override.
_ENV_FILES = (
    str(PROJECT_ROOT / "config" / ".env"),
    str(PROJECT_ROOT / ".env"),
)

# Populate os.environ so os.environ.get() works for per-pipeline token vars
# (pydantic-settings only maps declared fields, not arbitrary env vars).
for _f in _ENV_FILES:
    if Path(_f).exists():
        load_dotenv(_f, override=True)


class Settings(BaseSettings):
    github_token: str = ""
    database_url: str = "executions.db"
    queue_limit: int = 50
    dagshub_user: str = ""
    dagshub_token: str = ""
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    service_role_key: str = ""

    class Config:
        env_file = _ENV_FILES
        extra = "ignore"


settings = Settings()
APP_CONFIG_PATH = PROJECT_ROOT / "config" / "config.yaml"
PIPELINES_CONFIG_PATH = PROJECT_ROOT / "config" / "pipelines.yaml"


@lru_cache(maxsize=1)
def load_app_config() -> dict:
    if not APP_CONFIG_PATH.exists():
        return {}
    with open(APP_CONFIG_PATH) as f:
        data = yaml.safe_load(f) or {}
    return data if isinstance(data, dict) else {}


def load_pipelines_config() -> dict[str, dict]:
    """Load all pipeline-project definitions from pipelines.yaml. Not cached."""
    if not PIPELINES_CONFIG_PATH.exists():
        return {}
    with open(PIPELINES_CONFIG_PATH) as f:
        data = yaml.safe_load(f) or {}
    return data.get("pipelines", {}) if isinstance(data, dict) else {}


def get_pipeline_project(pipeline_id: str) -> dict:
    """Return config dict for a named pipeline-project with all paths resolved.

    Supports a compact form with just `external_base`; all sub-paths are derived
    from it automatically and can be overridden with explicit keys if needed.
    """
    projects = load_pipelines_config()
    if pipeline_id not in projects:
        raise ValueError(f"Pipeline project '{pipeline_id}' not found in pipelines.yaml")
    proj = dict(projects[pipeline_id])
    proj["id"] = pipeline_id

    # Derive paths from external_base when not explicitly set
    base = proj.get("external_base")
    if base:
        repo_dir = f"{base}/repo_actions"
        proj.setdefault("actions_repo_local_path",    repo_dir)
        proj.setdefault("actions_repo_path_executions", f"{repo_dir}/executions")
        proj.setdefault("analisis_files_path",        f"{repo_dir}/analisis_files")
        proj.setdefault("traceability_path",          f"{repo_dir}/scripts/traceability_schema.yaml")
        proj.setdefault("local_pipeline_path",        f"{base}/repo_local_runner")

    return proj


def resolve_project_path(pipeline_id: str, key: str, fallback: str) -> Path:
    """Resolve a per-project config key to an absolute Path."""
    proj = get_pipeline_project(pipeline_id)
    raw = str(proj.get(key, fallback))
    p = Path(raw)
    return p if p.is_absolute() else PROJECT_ROOT / p


def phases_runner_path() -> Path:
    app_config = load_app_config()
    configured_path = str(app_config.get("phases_runner", "config/fases_execution_runners.yaml"))
    candidate = Path(configured_path)
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    if candidate.exists():
        return candidate
    return PROJECT_ROOT / "backend" / "config" / "fases_execution_runners.yaml"


def resolve_pipeline_config_path(pipeline_id: str, key: str, fallback: str) -> Path:
    """Resolve a config-file path: checks pipeline project config first, then fallback."""
    proj = get_pipeline_project(pipeline_id)
    raw = proj.get(key) or fallback
    p = Path(str(raw))
    return p if p.is_absolute() else PROJECT_ROOT / p


def get_pipeline_token(pipeline_id: str) -> str:
    """Return the GitHub token for a pipeline.

    Reads the env var named by `github_token_env` in pipelines.yaml.
    Falls back to the global GITHUB_TOKEN / settings.github_token.
    """
    proj = get_pipeline_project(pipeline_id)
    env_var = proj.get("github_token_env", "GITHUB_TOKEN")
    return os.environ.get(env_var, settings.github_token)


def fase_runners_path(pipeline_id: str) -> Path:
    """Path to per-pipeline fase→runner assignment yaml."""
    return resolve_pipeline_config_path(
        pipeline_id, "fase_runners", "config/fases_execution_runners.yaml"
    )
