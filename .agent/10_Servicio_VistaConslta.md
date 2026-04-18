# 10 Servicio VistaConsulta

Vista 2. Resumen operativo sin perder la estructura visual.

## Qué hace
- Crea ejecuciones de fase y variante sin `curl`.
- Valida parámetros con `traceability_schema.yaml`.
- Resuelve dependencias parent-child.
- Gestiona cola, ejecución activa e histórico.
- Usa `fases_execution_runners.yaml` para runners y concurrencia.

## Estructura de UI
- Columna izquierda: tarjetas de fase apiladas con scroll vertical.
- Columna derecha: cola activa, ejecución en curso, histórico y estado global.
- Cada tarjeta conserva `variant`, `parent`, parámetros, dependencias y acción principal.
- La vista no debe convertirse en una tabla plana: la tarjeta es la unidad de interacción.

## Anatomía de cada tarjeta
- Cabecera con nombre de fase y badge de estado.
- Bloque de contexto con `variant`, `parent` y runner destino.
- Bloque de parámetros editables o precargados.
- Acciones principales: ejecutar, cancelar, reintentar, duplicar.
- Indicadores secundarios: validación, colisión de cola, dependencia pendiente.

## Panel derecho
- Cola activa con orden de despacho.
- Detalle de la ejecución seleccionada.
- Histórico reciente y errores resumidos.
- Feed SSE para cambios de estado en tiempo real.

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
- `VALIDATION_ERROR`
- `PARENT_NOT_FOUND`
- `PARENT_FAILED`
- `RUNNER_UNAVAILABLE`
- `QUEUE_LIMIT_REACHED`
- `DISPATCH_ERROR`
- `EXECUTION_TIMEOUT`
- `PERMISSION_DENIED`
