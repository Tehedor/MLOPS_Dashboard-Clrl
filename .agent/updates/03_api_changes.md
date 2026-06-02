# API Changes — Multi-Repo Refactor

## Nuevos endpoints

| Método | Path | Descripción |
|---|---|---|
| GET | `/api/pipeline-projects` | Lista todas las pipeline-projects definidas |
| GET | `/api/pipeline-projects/{pipeline_id}` | Detalle de una pipeline-project |
| GET | `/api/lineage/all-statuses` | Estado de lineage de todos los proyectos |

## Endpoints modificados

### Executions
- `POST /api/executions` — body ahora requiere `pipeline_id: str`
- `GET /api/executions` — acepta `?pipeline_id=<slug>` para filtrar (opcional)
- `GET /api/executions/gh-logs/{gh_run_id}` — ahora requiere `?pipeline_id=<slug>` (necesario para saber qué repo consultar en GH API)

### Lineage
- `GET /api/lineage/status` — requiere `?pipeline_id=<slug>`
- `GET /api/lineage/html` — requiere `?pipeline_id=<slug>`
- `POST /api/lineage/refresh` — requiere `?pipeline_id=<slug>`

### Variants
- `GET /api/variants/phases` — requiere `?pipeline_id=<slug>`
- `GET /api/variants/exists` — requiere `?pipeline_id=<slug>`
- `GET /api/variants/rows` — requiere `?pipeline_id=<slug>`
- `POST /api/variants/sync` — requiere `?pipeline_id=<slug>`
- `POST /api/variants/local/pull` — body añade `pipeline_id`
- `POST /api/variants/local/delete` — body añade `pipeline_id`
- `GET /api/variants/report/{pipeline_id}/{phase}/{variant}/{filename}` — pipeline_id en path

## Schemas actualizados

### ExecutionCreate
```json
{
  "pipeline_id": "testPipelineEpoch",
  "fase": "f01_explore",
  "variant": "v1_0001",
  "parent": null,
  "params": {},
  "selected_runner": null
}
```

### Execution
```json
{
  "id": "uuid",
  "pipeline_id": "testPipelineEpoch",
  "fase": "f01_explore",
  "variant": "v1_0001",
  ...
}
```

### DvcPayload (variants)
```json
{
  "phase": "f01_explore",
  "variant": "v1_0001",
  "pipeline_id": "testPipelineEpoch"
}
```

## Endpoints sin cambios

- `GET /api/executions/phases` — fases compartidas, sin pipeline_id
- `GET/POST /api/executions/queue/status|pause|resume`
- `GET /api/config`
- `GET /api/runners/*`
- `WS /ws/terminal/*`
- `GET /api/services/*`
- `GET /api/variants/table-config/{phase_id}`
- `GET /api/variants/jobs/{job_id}`
