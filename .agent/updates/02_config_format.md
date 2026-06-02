# Formato de Configuración — Multi-Repo

## pipelines.yaml (NUEVO)

Define las pipeline-projects. El frontend leerá `GET /api/pipeline-projects` para obtener la lista.

```yaml
pipelines:
  <slug>:             # pipeline_id — usado en toda la API
    label: str        # nombre legible para UI
    repo: str         # "owner/repo" en GitHub
    branch: str       # branch que usa GH Actions y el local runner
    traceability_path: str          # path relativo al params/traceability schema
    actions_repo_local_path: str    # donde se clona el repo para sync
    actions_repo_path_executions: str  # path dentro del repo clonado con results
    analisis_files_path: str        # opcional, para vista de análisis
    local_pipeline_path: str        # workspace del local runner
    mlflow_tracking_uri: str        # opcional, para links a MLflow
    dagshub_repository: str         # opcional, para links a DagsHub
```

## config.yaml (MODIFICADO — solo settings globales)

```yaml
repo_sync_interval_seconds: int
table_refresh_interval_seconds: int
phases_runner: path           # fases_execution_runners.yaml — compartido
local_workflows: path         # local_workflows.yaml — compartido
local_runner_use_venv: "0"|"1"
services_external_ctrl: path
table_config: path
TERMINAL_RUNNERS:
  <name>:
    url: ENV_VAR
    username: ENV_VAR
    password: ENV_VAR
```

## Keys eliminados de config.yaml

- `github_actions_repository` → `pipelines.yaml::repo`
- `actions_branch` → `pipelines.yaml::branch`
- `actions_repo_local_path` → `pipelines.yaml::actions_repo_local_path`
- `actions_repo_path_executions` → `pipelines.yaml::actions_repo_path_executions`
- `analisis_files_path` → `pipelines.yaml::analisis_files_path`
- `local_runner_workspace` → `pipelines.yaml::local_pipeline_path`
- `params_file` → `pipelines.yaml::traceability_path`
- `mlflow_tracking_uri` → `pipelines.yaml::mlflow_tracking_uri`
- `dagshub_repository` → `pipelines.yaml::dagshub_repository`

## Añadir una nueva pipeline-project

1. Añadir entrada en `pipelines.yaml` con un slug único.
2. Reiniciar el backend (no hay hot-reload de config).
3. El frontend mostrará automáticamente la nueva pestaña en la vista Ejecuciones.
