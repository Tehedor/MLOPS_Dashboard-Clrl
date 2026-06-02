# Database Migration — Multi-Repo Refactor

## Cambios de schema

### Tabla `executions`
- Nueva columna `pipeline_id TEXT NOT NULL DEFAULT ''` en posición 2 (después de `id`)
- Orden de columnas actualizado: `id, pipeline_id, fase, variant, parent, runner, params, status, error_code, gh_run_id, created_at, updated_at`

### Tabla `execution_variants`
- Nueva columna `pipeline_id TEXT NOT NULL DEFAULT ''`
- Nueva primary key pattern: `pipeline_id/phase/variant` (string concatenado como id)
- Nuevos índices: `idx_ev_pipeline`, `idx_ev_phase`, `idx_ev_variant`
- El id anterior era `phase/variant`; ahora es `pipeline_id/phase/variant`

## Estrategia de migración

Se eligió **borrar y recrear** (aceptado por el usuario).

### `executions`
`init_db()` detecta en startup si la columna `pipeline_id` existe via `PRAGMA table_info`. Si no existe, hace `DROP TABLE IF EXISTS executions` antes de `CREATE TABLE IF NOT EXISTS`. Esto ocurre **una sola vez** — en el primer arranque tras el upgrade. Después, el `IF NOT EXISTS` es no-op.

### `execution_variants`
Siempre se hace `DROP TABLE IF EXISTS execution_variants` en `init_db()` porque la tabla es una caché reconstruida desde disco en cada startup via `variants_service.sync_all()`. No hay pérdida de datos.

## Consecuencias

- Historial de ejecuciones previas se pierde en la primera arrancada post-upgrade.
- Las variantes se reconstruyen automáticamente desde el repo clonado en startup.
- Los proyectos existentes con `pipeline_id=''` no aparecerán — las ejecuciones históricas no están disponibles.
