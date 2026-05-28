# MLOps Dashboard — Registro de archivos de configuración

Índice de todos los archivos de configuración y variables de entorno del proyecto.  
Las rutas son relativas a la raíz del repo (`app_ctrl/`).

---

## Variables de entorno (`.env`)

| Archivo | Descripción | En `.gitignore` |
|---|---|---|
| `.env.example` | Plantilla raíz de variables de entorno de la app | — |
| `backend/.env` | Variables activas del backend FastAPI | ✅ sí |
| `backend/.env.example` | Plantilla del backend | — |
| `runners_k8s/runnerMicrocontrolador/.env` | Variables del runner físico (ESP32 / ttyd / cloudflared) | ✅ sí |
| `runners_k8s/runnerMicrocontrolador/.env.example` | Plantilla del runner físico | — |
| `services-repos/windows_event_analyzer/app/.env` | Variables del microservicio de análisis de eventos Windows | ✅ sí |

> **Regla:** nunca commitear archivos `.env` reales. Los `.env.example` son las únicas plantillas versionadas.

---

## Configuración principal de la app

| Archivo | Descripción |
|---|---|
| `config.yaml` | Configuración central: repo GitHub Actions, rutas locales, runners de terminal, intervalos de sync |
| `docker-compose.yml` | Compose raíz — levanta backend + frontend juntos |
| `backend/Dockerfile` | Imagen Docker del backend FastAPI |

---

## config/ — YAMLs del dashboard

| Archivo | Descripción |
|---|---|
| `config/fases_execution_runners.yaml` | Definición de las 8 fases MLOps con sus runners disponibles y concurrencia máxima |
| `config/traceability_schema.yaml` | Esquema de parámetros y trazabilidad de variantes (fuente de verdad del formulario) |
| `config/table_config.yaml` | Configuración de columnas y display de la tabla de variantes |
| `config/services_external_ctrl.yaml` | Registro de servicios externos controlados desde el dashboard |
| `config/local_workflows.yaml` | Definición de los steps del runner local (equivalente a los GH Actions pero ejecutado en local) |

---

## GitHub Actions workflows — `external/repo_actions/.github/`

Versión activa en `workflows/`, versiones históricas en `workflows_pipeline_v0/` y `workflows_pipeline_v1/`.

| Archivo | Descripción |
|---|---|
| `workflows/61_mlops_Orchestator_trigger.yml` | Workflow orquestador principal — recibe dispatch y lanza la fase correspondiente |
| `workflows/Build_Docker_job_container.yml` | Build y push de la imagen Docker de los job containers |
| `workflows/reusable_fase1-Explore.yml` | Workflow reutilizable — Fase 1: Exploración |
| `workflows/reusable_fase2-PrepareEvents.yml` | Fase 2: Preparación de eventos |
| `workflows/reusable_fase3-PrepareWindows.yml` | Fase 3: Preparación de ventanas |
| `workflows/reusable_fase4-TargetEngineering.yml` | Fase 4: Ingeniería de targets |
| `workflows/reusable_fase5-Modeling.yml` | Fase 5: Modelado |
| `workflows/reusable_fase6-Quantiza&packageForEdge.yml` | Fase 6: Cuantización y empaquetado para edge |
| `workflows/reusable_fase7-ValidateModelEdgeHardware.yml` | Fase 7: Validación hardware edge (ESP32) |
| `workflows/reusable_fase8-ValidateMulti-ModelEdgeSystem.yml` | Fase 8: Validación multi-modelo sistema edge |
| `.github/actions/commit-and-pr/action.yml` | Action reutilizable para commit y apertura de PR de resultados |

---

## Pipeline MLOps — `external/repo_actions/`

| Archivo | Descripción |
|---|---|
| `.mlops4ofp/pipeline_ref.yaml` | Referencia del pipeline: fases, dependencias y runners |
| `.mlops4ofp/setup.yaml` | Setup del entorno mlops4ofp |
| `setup/local.yaml` | Configuración del runner local |
| `setup/remote.yaml` | Configuración del runner remoto (GH Actions) |
| `setup/remote2.yaml` | Configuración alternativa de runner remoto |
| `setup/workflow.yaml` | Configuración de workflow por defecto |
| `scripts/traceability_schema.yaml` | Copia del esquema de trazabilidad usada por los scripts del pipeline |
| `makefile_check_phases.yml` | Check de fases para Makefile |
| `requirements.txt` | Dependencias Python del pipeline de acciones |

---

## Runner físico — `runners_k8s/runnerMicrocontrolador/`

| Archivo | Descripción |
|---|---|
| `templates/config.yaml.tpl` | Plantilla de configuración del agente GitHub Actions (ARC) |
| `templates/cftunnel.service.tpl` | Plantilla systemd para el túnel Cloudflare |
| `templates/ttyd.service.tpl` | Plantilla systemd para ttyd (terminal web) |
| `Makefile` | Comandos de despliegue y gestión del runner |

---

## Runner Kubernetes (ARC) — `runners_k8s/v4/`

Versión activa en `v4/`, versiones históricas en `v4/.waste/`.

| Archivo | Descripción |
|---|---|
| `v4/guion-arc-deploy-v4.md` | Guión de despliegue del controller ARC en K8s |
| `v4/env.md` | Variables necesarias para el despliegue ARC (tokens GitHub PAT) |

---

## Servicios externos — `services-repos/`

### MDS-Dashboard
| Archivo | Descripción |
|---|---|
| `services-repos/MDS-Dashboard/docker-compose.yml` | Compose de producción |
| `services-repos/MDS-Dashboard/docker-compose.dev.yml` | Compose de desarrollo |
| `services-repos/MDS-Dashboard/Dockerfile` | Imagen del servicio |

### windows_event_analyzer
| Archivo | Descripción |
|---|---|
| `services-repos/windows_event_analyzer/docker-compose.yml` | Compose de producción |
| `services-repos/windows_event_analyzer/docker-compose.dev.yml` | Compose de desarrollo |
| `services-repos/windows_event_analyzer/docker/Dockerfile` | Imagen de producción |
| `services-repos/windows_event_analyzer/docker/Dockerfile.dev` | Imagen de desarrollo |
| `services-repos/windows_event_analyzer/app/requirements.txt` | Dependencias Python del microservicio |

---

## Servicios temporales — `services/`

| Archivo | Descripción |
|---|---|
| `services/temporal_app/docker-compose.yml` | Compose del servicio temporal |
| `services/windows_app/docker-compose.yml` | Compose del servicio Windows |

---

## Dependencias

| Archivo | Descripción |
|---|---|
| `backend/requirements.txt` | Dependencias Python del backend FastAPI |
| `fronted/package.json` | Dependencias Node del frontend React |
| `external/repo_actions/requirements.txt` | Dependencias Python del pipeline GH Actions |
| `external/repo_local_runner/requirements.txt` | Dependencias Python del runner local |
