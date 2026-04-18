# 10.5 Vista de Consulta (Especificación Mejorada)

## 1. Objetivo
La Vista de Consulta permite lanzar ejecuciones de fases y variantes sin herramientas externas (por ejemplo, curl), monitorizar su estado en tiempo real y administrar la cola de ejecución respetando dependencias y capacidad de runners.

## 2. Alcance
- Crear ejecuciones por fase/variante.
- Validar parámetros dinámicos desde `traceability_schema.yaml`.
- Gestionar cola con límite de concurrencia.
- Resolver dependencias parent-child.
- Mostrar ejecuciones activas, en espera y finalizadas.
- Permitir acciones operativas: cancelar, reintentar y relanzar.

## 3. Entradas de configuración
- `traceability_schema.yaml`: define campos dinámicos, tipos, validaciones y valores por defecto.
- `fases_execution_runners.yaml`: define qué fase puede ejecutarse en cada runner y sus límites.
- `60_deploy-api.http`:  Ejemplo de peticiones de todas las fases

## 4. Diseño de interfaz

### 4.1 Estructura de pantalla
```text
+-----------------------------------------+-------------------------------------------------+
|                                         |                                                 |
|  +-----------------------------------+  |  [5]            [6]  |  [8]            [9]  |
|  |                [1]                |  |                      |                      |
|  +-----------------------------------+  |                      |                      |
|                                         |                      |                      |
|  +-----------------------------------+  |                      |                      |
|  |                [2]                |  |         [7]          |         [10]         |
|  +-----------------------------------+  |                      |                      |
|                                         |                      |                      |
|  +-----------------------------------+  |                      |                      |
|  |                [3]                |  |                      |                      |
|  +-----------------------------------+  |                      |                      |
|                                         |                      |                      |
|          [4]                            |                      |                      |
|                                         |                      |                      |
+-----------------------------------------+-------------------------------------------------+
```

### 4.2 Mapeo de elementos
- `[1]`, `[2]`, `[3]`: tarjetas de fases.
- `[4]`: scroll vertical de fases.
- `[5]`: filtro variante (cola/ejecución).
# 10 Servicio VistaConsulta

Resumen corto de la vista 2. La especificación completa vive en [10.5_Servicio_VistaConslta.md](10.5_Servicio_VistaConslta.md).

## Qué hace
- Crea ejecuciones de fase y variante sin herramientas externas como `curl`.
- Valida parámetros dinámicos con [traceability_schema.yaml](traceability_schema.yaml).
- Resuelve dependencias parent-child.
- Gestiona cola, ejecución activa e histórico.
- Mantiene la correlación entre fase, runner y límites de concurrencia usando [fases_execution_runners.yaml](fases_execution_runners.yaml).

## UI esperada
- Columna izquierda: tarjetas de fase.
- Área derecha: cola activa y resultados históricos.
- Cada tarjeta debe mostrar `variant`, `parent`, parámetros y acción principal.

## Estado del documento
- Este archivo es solo un resumen operativo.
- Para API, estados, errores y contratos, usar [10.5_Servicio_VistaConslta.md](10.5_Servicio_VistaConslta.md).
  "params": {
    "STRATEGY": "transitions",
    "BANDS": [10, 90],
    "NAN_MODE": "discard"
  }
}
```
- Response `202`:
```json
{
  "execution_id": "exec_234",
  "status": "queued",
  "provider": "github_repository_dispatch",
  "created_at": "2026-04-17T10:00:00Z"
}
```

Notas de contrato:
- `variant_id` y `parent_variant` se manejan como string para mantener compatibilidad con el payload de GitHub.
- El backend crea `execution_id` interno antes del envío a GitHub para conservar trazabilidad incluso cuando GitHub responde sin cuerpo.

### 9.2 Listar ejecuciones
- `GET /api/executions?status=running,queued&phase=fase_1&variant=12&page=1&page_size=20`

### 9.3 Obtener detalle
- `GET /api/executions/{execution_id}`

### 9.4 Cancelar ejecución
- `POST /api/executions/{execution_id}/cancel`

### 9.5 Reintentar ejecución fallida
- `POST /api/executions/{execution_id}/retry`

### 9.6 Eventos de estado en tiempo real
- `GET /api/executions/stream` (SSE)
- Evento SSE ejemplo:
```json
{
  "execution_id": "exec_234",
  "prev_status": "dispatching",
  "new_status": "running",
  "timestamp": "2026-04-17T10:00:03Z",
  "reason": null
}
```

### 9.7 Integración externa real: GitHub Repository Dispatch
Request saliente del backend:
- `POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches`
- Headers requeridos:
  - `Accept: application/vnd.github.v3+json`
  - `Authorization: Bearer <fine-grained-token>`
  - `X-GitHub-Api-Version: 2022-11-28`
  - `Content-Type: application/json`
- Body:
```json
{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "02_prepareeventsds",
    "variant_id": "v202",
    "parent_variant": "v001",
    "params": {
      "STRATEGY": "transitions",
      "BANDS": [10, 90],
      "NAN_MODE": "discard"
    }
  }
}
```

Respuesta esperada de GitHub:
- `204 No Content`

Interpretación operativa del `204`:
- El evento fue aceptado por GitHub, pero no devuelve `run_id` ni body.
- El backend mantiene la ejecución en estado `dispatching` hasta poder asociar el run real por correlación.
- Correlación recomendada: incluir `execution_id` interno dentro de `client_payload` para localizar el workflow run posterior.
- Si no se logra correlación en la ventana `dispatch_correlation_timeout`, pasar a `failed` con código `DISPATCH_ERROR`.

## 10. Acciones de usuario en UI
En cada tarjeta de fase:
- `Ejecutar`
- `Limpiar`
- `Autocompletar defaults`

En tablas de ejecución:
- `Ver detalle`
- `Cancelar`
- `Reintentar`
- `Duplicar ejecución`

## 11. Mensajes y códigos de error
Códigos mínimos:
- `VALIDATION_ERROR`
- `PARENT_NOT_FOUND`
- `PARENT_FAILED`
- `RUNNER_UNAVAILABLE`
- `QUEUE_LIMIT_REACHED`
- `DISPATCH_ERROR`
- `EXECUTION_TIMEOUT`
- `PERMISSION_DENIED`

Regla UX: cada error debe mostrar causa, impacto y siguiente acción recomendada.

## 12. Filtros y búsqueda
Filtros mínimos en cola y resultados:
- Fase
- Variante
- Estado
- Runner
- Rango temporal
- ID de ejecución

Reglas:
- Filtros combinables.
- Paginación obligatoria en resultados.
- Orden por fecha descendente en histórico.

## 13. Auditoría y trazabilidad
Registrar por ejecución:
- `execution_id`, `phase`, `variant`, `params_hash`.
- usuario solicitante.
- timestamps por cambio de estado.
- runner asignado.
- motivo de fallo o cancelación.

## 14. Permisos
Roles recomendados:
- `viewer`: solo lectura.
- `operator`: ejecutar, cancelar y reintentar.
- `admin`: gestión completa y configuración de límites.

## 15. Criterios de aceptación
- Crear ejecución válida devuelve `202` y estado inicial `queued`.
- Dependencia con parent en curso mueve a `waiting_parent`.
- Parent fallido bloquea child con `PARENT_FAILED`.
- Al liberar capacidad y runner, ejecución pasa a `dispatching` y `running`.
- Cancelación en cola y en ejecución se refleja en UI en menos de 2 segundos.
- Filtros devuelven resultados consistentes con paginación.
- Cada transición de estado genera evento SSE.

## 16. Fuera de alcance del MVP
- Priorización avanzada por SLA.
- Dependencias múltiples por ejecución.
- Planificador distribuido multi-nodo con alta disponibilidad.
- Reglas complejas de orquestación por calendario.

## 17. Próximos pasos de implementación
1. Definir modelos de datos de ejecución y eventos.
2. Implementar validador dinámico desde `traceability_schema.yaml`.
3. Implementar cola FIFO con límites por runner.
4. Añadir API mínima de ejecuciones.
5. Conectar frontend con SSE para refresco de estado.
6. Añadir pruebas de dependencias parent-child y cancelación.