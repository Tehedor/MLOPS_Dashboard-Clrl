# Multi-Repo Backend Refactor — Visión General

## Problema anterior
El backend asumía un único proyecto: un solo repo, branch, workspace, traceability schema y ruta de ejecuciones, todos hardcodeados en `config.yaml` o en `settings.github_repo`.

## Nuevo concepto: PipelineProject
Un **pipeline-project** = `(slug, repo, branch, traceability_path, local_pipeline_path, ...)`.
- El `slug` (ej. `testPipelineEpoch`) es el `pipeline_id` usado en toda la API.
- Una pipeline-project es inmutable en runtime: para cambiarla se edita `pipelines.yaml` y se reinicia el backend.
- Runners y fases son **compartidos** entre todas las pipeline-projects (mismo `fases_execution_runners.yaml`).

## Archivos modificados/creados

| Archivo | Tipo | Razón |
|---|---|---|
| `pipelines.yaml` | NUEVO | Registry de pipeline-projects |
| `config.yaml` | MODIFICADO | Solo settings globales — eliminados keys per-project |
| `backend/app/core/config.py` | MODIFICADO | `load_pipelines_config()`, `get_pipeline_project()` |
| `backend/app/schemas/pipeline_project.py` | NUEVO | Pydantic model para pipeline-project |
| `backend/app/schemas/execution.py` | MODIFICADO | `pipeline_id` en `Execution` y `ExecutionCreate` |
| `backend/app/core/db.py` | MODIFICADO | `pipeline_id` en tablas, migración automática |
| `backend/app/services/github.py` | MODIFICADO | `repo` parametrizado en todas las funciones |
| `backend/app/services/repo_sync_service.py` | MODIFICADO | `_states` por pipeline_id, multi-project polling |
| `backend/app/services/lineage_service.py` | MODIFICADO | `_states` por pipeline_id |
| `backend/app/services/execution_service.py` | MODIFICADO | Dispatch y cancel per-project |
| `backend/app/services/local_runner_service.py` | MODIFICADO | workspace/branch/repo per-project |
| `backend/app/services/variants_service.py` | MODIFICADO | Todas las funciones toman `pipeline_id` |
| `backend/app/api/routers/pipeline_projects.py` | NUEVO | `GET /api/pipeline-projects` |
| `backend/app/api/routers/executions.py` | MODIFICADO | Filter `?pipeline_id=`, `gh-logs` requiere pipeline_id |
| `backend/app/api/routers/lineage.py` | MODIFICADO | `?pipeline_id=` en todos los endpoints |
| `backend/app/api/routers/variants.py` | MODIFICADO | `pipeline_id` en todos los endpoints |
| `backend/app/main.py` | MODIFICADO | Nuevo router, sin static mount |
