# 30 Servicio 3 — LogsRunners (Vista GitHub Actions)

Vista que muestra el estado y los logs de ejecuciones de GitHub Actions
en tiempo real. Se integra con la infraestructura serverless descrita en
[31_Infraestructura_Webhooks.md](31_Infraestructura_Webhooks.md).

Referencias: [01_Stack.md](01_Stack.md), [10_Servicio_VistaConslta.md](10_Servicio_VistaConslta.md).

Estado: especificado, pendiente de implementación.

---

## Qué hace

- Muestra la lista de workflow runs de GitHub Actions agrupados por fase/variante.
- Recibe actualizaciones de estado (queued → in_progress → success/failure) en tiempo real.
- Muestra los logs de cada run **por bloques al finalizar cada step** del pipeline (no línea a línea en vivo).
- Permite releer el log completo de runs históricos.
- No lanza ejecuciones — eso es Vista 2. Esta vista es solo lectura.

---

## Fuente de datos

Los datos llegan desde **Supabase** (ver 31_Infraestructura_Webhooks.md):

- Tabla `workflow_runs`: un registro por run con estado y metadatos.
- Tabla `workflow_logs`: líneas de log acumuladas, FK a `workflow_runs`.
- El frontend se suscribe directamente al canal Realtime de Supabase.
- El backend local **no actúa como proxy** de estos datos; la suscripción
  es cliente ↔ Supabase directamente desde el frontend.

---

## Estructura de UI

```
┌─────────────────────────────────────────────────────────────┐
│  [Filtro: fase / variante / rama / estado]                  │
├────────────────────┬────────────────────────────────────────┤
│  LISTA DE RUNS     │  PANEL DE LOGS                         │
│                    │                                        │
│  ● run #42  ✓      │  ▶ step: checkout                     │
│  ● run #41  ✗      │    ✓ Run actions/checkout@v4           │
│  ● run #40  ⏳      │  ▶ step: train                        │
│                    │    [2024-04-25 20:01:03] epoch 1/10    │
│  [Cargar más]      │    [2024-04-25 20:01:04] loss: 0.421   │
│                    │    ...                                 │
│                    │  ● LIVE (parpadeante si activo)        │
└────────────────────┴────────────────────────────────────────┘
```

- Panel izquierdo: lista de runs con badge de estado, rama, SHA corto y tiempo.
- Panel derecho: visor de logs del run seleccionado.
  - Render ANSI con `ansi-to-html` o similar.
  - Los logs se añaden por bloques al completarse cada step; no hay stream línea a línea.
  - El indicador `LIVE` aparece mientras el run está `in_progress`; al completar el step llega el bloque de texto.
  - Auto-scroll al final cuando llega un bloque nuevo y el usuario no ha hecho scroll hacia arriba.
  - Botón "saltar al final" si el usuario ha desplazado la vista.

---

## Modelo de datos Supabase

### `workflow_runs`
| campo           | tipo        | descripción                              |
|-----------------|-------------|------------------------------------------|
| run_id          | bigint      | PK — ID nativo de GitHub Actions         |
| repo            | text        | `owner/repo`                             |
| branch          | text        | rama                                     |
| workflow_name   | text        | nombre del workflow                      |
| fase            | text        | tag de fase MLOps (del payload GHA)      |
| variant         | text        | tag de variante (del payload GHA)        |
| status          | text        | `queued|in_progress|success|failure`     |
| created_at      | timestamptz | inicio del run                           |
| updated_at      | timestamptz | última actualización de estado           |
| conclusion      | text        | `success|failure|cancelled|null`         |

### `workflow_logs`
| campo      | tipo        | descripción                               |
|------------|-------------|-------------------------------------------|
| id         | uuid        | PK                                        |
| run_id     | bigint      | FK → workflow_runs.run_id                 |
| step_name  | text        | nombre del step de GHA                    |
| line_no    | int         | número de línea dentro del step           |
| content    | text        | bloque de texto del step (puede incluir ANSI) |
| ts         | timestamptz | timestamp de inserción                    |

---

## Flujo de datos

```
GitHub Actions
  └─ step "notify-dashboard"
       POST /rest/v1/workflow_runs   → Supabase (estado)
       POST /rest/v1/workflow_logs   → Supabase (logs, en batches)

Supabase Realtime
  └─ canal: workflow_runs  → frontend actualiza lista
  └─ canal: workflow_logs  → frontend agrega líneas al visor
```

El step de GitHub Actions es un simple `curl` con la API Key en los
secrets del repositorio (ver 31_Infraestructura_Webhooks.md).

---

## Contratos del frontend

No hay endpoints propios de backend local para esta vista.
Toda la comunicación es contra Supabase:

```js
// suscripción a estado
supabase
  .channel('runs')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'workflow_runs' }, handler)
  .subscribe()

// suscripción a logs del run activo
supabase
  .channel(`logs:${runId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'workflow_logs',
    filter: `run_id=eq.${runId}`
  }, handler)
  .subscribe()
```

Lectura inicial (histórico) via REST:

```
GET /rest/v1/workflow_runs?order=created_at.desc&limit=50
GET /rest/v1/workflow_logs?run_id=eq.<run_id_bigint>&order=line_no.asc
```

---

## Estados de un run

`queued` → `in_progress` → `success | failure | cancelled`

El badge de estado en la lista usa color:
- queued: gris
- in_progress: amarillo parpadeante
- success: verde
- failure: rojo
- cancelled: gris apagado

---

## Política de retención de logs

Para no agotar los 500 MB gratuitos de Supabase se usa un trigger nativo
`AFTER INSERT ON workflow_logs` que ejecuta la limpieza en cada inserción:
- Borra `workflow_logs` con `ts < now() - interval '7 days'`.
- Borra `workflow_runs` con `updated_at < now() - interval '30 days'` y
  `conclusion IS NOT NULL` (runs ya terminados).
- El borrado de runs es en cascada sobre sus logs (`ON DELETE CASCADE`).

Ver SQL completo en `31_Infraestructura_Webhooks.md` y `doc/supabase.md`.

---

## Archivos a crear (implementación futura)

**Frontend:**
- `fronted/src/pages/LogsRunners.jsx` — página principal
- `fronted/src/features/logs/RunList.jsx` — lista de runs
- `fronted/src/features/logs/LogViewer.jsx` — visor ANSI
- `fronted/src/api/supabase.js` — cliente Supabase + helpers

**Configuración:**
- Variables en `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Secret en el repositorio GHA: `SUPABASE_SERVICE_KEY`

**GitHub Actions step** (en cada workflow que queremos monitorizar):
- `scripts/notify_dashboard.sh` o inline en el workflow yaml

**No se necesita** nuevo router ni servicio en el backend local para esta vista.
