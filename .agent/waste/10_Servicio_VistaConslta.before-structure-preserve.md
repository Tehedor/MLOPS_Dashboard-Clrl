# 10 Servicio VistaConsulta

Vista 2, resumen operativo.

## Qué hace
- Crea ejecuciones de fase y variante sin `curl`.
- Valida parámetros con `traceability_schema.yaml`.
- Resuelve dependencias parent-child.
- Gestiona cola, ejecución activa e histórico.
- Usa `fases_execution_runners.yaml` para runners y concurrencia.

## UI
- Izquierda: tarjetas de fase.
- Derecha: cola activa, estado y resultados.
- Cada tarjeta muestra `variant`, `parent`, parámetros y acción.

## Contratos mínimos
- `POST /api/executions`
- `GET /api/executions`
- `GET /api/executions/{execution_id}`
- `POST /api/executions/{execution_id}/cancel`
- `POST /api/executions/{execution_id}/retry`
- `GET /api/executions/stream` (SSE)

## Estados
- `queued`, `waiting_parent`, `dispatching`, `running`, `success`, `failed`, `canceled`

## Errores
- `VALIDATION_ERROR`, `PARENT_NOT_FOUND`, `PARENT_FAILED`, `RUNNER_UNAVAILABLE`, `QUEUE_LIMIT_REACHED`, `DISPATCH_ERROR`, `EXECUTION_TIMEOUT`, `PERMISSION_DENIED`
