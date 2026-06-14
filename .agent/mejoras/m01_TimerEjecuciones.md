# Timer de runners en vista ejecuciones

Quieor que me salga un timer de tiempo ejecutnado tanto en la sección de pipeline cuando ya esta en runnnign como en historico cuando ya se ha temrinado un runner.


Ten en cuenta que la manera que te pongo es una idea, si se te ocurre algo mejor implementalo

## Sección Pipeline
Para que no consulte todo el rato a github actions lo suyo es que pregunta a supabase en que momento a empezado el runner.
Para que este mas optimizado a lo mejor solo debería preugntar en el momento en el que estoy en el tab y a paritr de ahi que salga con contador gestioando por la aplcación. Por lo que el counter es desde este sistema

## Sección historico



Implemeta mirando la fecha en la que ha arrancado al ejecución, no la que en la que se ha apretoado el botno de ejecutar, sino el moemnto que ha empezado el running


## Observaciones
Lo que te doy son ideas, si ves algo mas optimo adatpado a nuestro codigo sientete libre de implemanrlo. Los cambios que hagas y el como funcione añademlo debajo de este file para poder auditarlo.

---

## Implementación — 2026-06-09

### Decisión de diseño
En lugar de consultar Supabase, se añadió el campo `started_at` directamente al modelo de ejecución del backend local. Se fija en el momento exacto en que el status transiciona a `running` (no cuando se encola). El frontend lee este campo directamente desde los datos de ejecución que ya tiene cargados, sin peticiones adicionales.

### Backend

**`db.py`** — Columna `started_at TEXT` añadida a `CREATE TABLE`. Migración automática en `init_db()` con `ALTER TABLE executions ADD COLUMN started_at TEXT` para DBs existentes.

**`schemas/execution.py`** — `started_at: str | None = None` añadido al modelo `Execution`.

**`execution_service.py`** — Tres cambios:
1. `_row_to_execution`: lee `row[12]` → `started_at`.
2. `create`: INSERT con columnas explícitas (13 params).
3. `_update_status`: al entrar en `running`, `SET started_at = COALESCE(started_at, ?)` — solo escribe la primera vez; reintentos no sobreescriben el timestamp original.

### Sección Pipeline (PipelinePanel.jsx)

Componente `RunningTimer({ startIso })`:
- `setInterval` de 1 segundo, calcula `Math.floor((Date.now() - new Date(startIso)) / 1000)`.
- Formato: `Xs` / `Xm Ys` / `Xh Ym`.
- Se muestra cuando `ex.status === 'running' && ex.started_at`, con un punto verde pulsante junto a la fecha.
- No consulta ni GHA ni Supabase: todo el timing lo gestiona el cliente desde que recibe el dato.

### Sección Histórico (HistoryPanel.jsx)

Componente `DurationChip({ startedAt, createdAt, updatedAt })`:
- Muestra `⏱ Xm Ys` usando `started_at` → `updated_at` como rango.
- Si `started_at` es null (ejecuciones anteriores al fix), no muestra nada (evita confundir con tiempo de cola).
- Visible directamente en la card sin necesidad de expandir el detalle.