from functools import lru_cache
from pathlib import Path

import yaml
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    github_token: str = ""
    github_repo: str = ""  # legacy — kept for supabase_sync_service backward compat
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
PIPELINES_CONFIG_PATH = PROJECT_ROOT / "pipelines.yaml"


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
