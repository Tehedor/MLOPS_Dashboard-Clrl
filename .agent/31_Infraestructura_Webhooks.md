# 31 Infraestructura Webhooks — Solución Serverless

Decisión de arquitectura para recibir eventos y logs de GitHub Actions
en todos los clientes self-hosted del dashboard MLOps.

---

## Problema

GitHub solo admite una URL de webhook por evento. La app es self-hosted
(cada usuario tiene su instancia), por lo que necesitamos un intermediario
que funcione como **broker Pub/Sub**:

```
GitHub Actions → [broker serverless] → N instancias self-hosted
```

Restricciones duras:
- 100 % serverless (sin VPS ni autoalojamiento del broker)
- Free tier viable
- Patrón 1-a-N (fan-out a todos los clientes)
- Dos tipos de tráfico: estados (eventos puntuales) + logs (alto volumen)

---

## Evaluación de opciones

### Opción 1 — Supabase (PostgreSQL + REST + Realtime)  ✅ ELEGIDA

| criterio         | valoración                                                  |
|------------------|-------------------------------------------------------------|
| escritura GHA    | `curl` directo a la REST API. Sin límite de peticiones.     |
| lectura clientes | SDK Realtime (WebSocket). Push nativo, equivale a SSE.      |
| límite escritura | ilimitado vía REST; solo cuenta almacenamiento (500 MB)     |
| límite lectura   | 200 conexiones concurrentes simultáneas (suficiente)        |
| logs             | riesgo: llenar 500 MB. Mitigado con rotación agresiva (7d). |
| complejidad      | baja. Un solo servicio. SDK oficial para React.             |
| alineación stack | Realtime ≡ SSE/WS que ya usa el proyecto.                   |

**Por qué gana:** el único cuello de botella es el almacenamiento, y es
gestionable con una política de retención. Todos los demás ejes son
superiores al resto de opciones.

---

### Opción 2 — Cloudflare Workers + Upstash Redis  ✗ DESCARTADA

Upstash Free Tier: **10 000 comandos/día**.

Un job con 200 líneas de log = ~200 escrituras + ~200 lecturas de polling
= 400 comandos. Con 25 jobs/día ya se agota. Inviable para logs.

---

### Opción 3 — Cloudflare Workers + D1 + Polling  ⚠ SEGUNDA OPCIÓN

D1 Free: 100 000 escrituras/día, 5 M lecturas/día. Workers: 100 000 req/día.

Límites muy generosos. El problema es el modelo de acceso: requiere
**polling** desde los clientes (no push), lo que introduce latencia
configurable y tráfico constante aunque no haya cambios.

Viable como fallback si Supabase no encaja, pero la UX es inferior.

---

### Opción 4 — Firebase Firestore  ✗ DESCARTADA

Free Tier: **20 000 escrituras/día**.

Con logs granulares (línea a línea) se agota antes del mediodía en un
día de entrenamiento intensivo. Las lecturas (50 000/día) también son
ajustadas con múltiples instancias suscribiéndose.

---

## Arquitectura elegida: Supabase

```
┌──────────────────────────────────────────────────────────────┐
│  GitHub Actions (repo MLOps)                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  step: notify-dashboard                              │   │
│  │  curl POST /rest/v1/workflow_runs   (estado)         │   │
│  │  curl POST /rest/v1/workflow_logs   (batch de logs)  │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬──────────────────────────────────┘
                            │  HTTPS + Service Key
                            ▼
              ┌─────────────────────────┐
              │       SUPABASE          │
              │  PostgreSQL             │
              │  REST API (escritura)   │
              │  Realtime WS (lectura)  │
              └────────────┬────────────┘
                           │  WebSocket (anon key)
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   instancia A      instancia B      instancia C
   (self-hosted)   (self-hosted)   (self-hosted)
   LogsRunners.jsx LogsRunners.jsx LogsRunners.jsx
```

El broker es Supabase. No hay intermediario propio.
El backend local **no participa** en este flujo.

---

## Configuración Supabase

### Tablas (ver esquema completo en 30_Servicio3_logsRunners.md)

```sql
-- workflow_runs
-- run_id es el ID nativo de GitHub Actions (bigint) — usado directamente
-- como PK para que los scripts bash puedan hacer upsert sin resolver UUIDs.
create table workflow_runs (
  run_id        bigint primary key,
  repo          text not null,
  branch        text,
  workflow_name text,
  fase          text,
  variant       text,
  status        text not null default 'queued',
  conclusion    text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- workflow_logs
create table workflow_logs (
  id        uuid primary key default gen_random_uuid(),
  run_id    bigint not null references workflow_runs(run_id) on delete cascade,
  step_name text,
  line_no   int,
  content   text,  -- bloque de texto del step completo
  ts        timestamptz default now()
);

-- índice para lecturas por run
create index on workflow_logs(run_id, line_no);
```

### Habilitar Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_logs;
```

### Row Level Security

Para una app self-hosted simple, RLS puede desactivarse o usar una
política abierta en la tabla:

```sql
alter table workflow_runs enable row level security;
create policy "anon read" on workflow_runs for select using (true);

alter table workflow_logs enable row level security;
create policy "anon read" on workflow_logs for select using (true);
```

No se necesita política explícita para escritura con `service_role`:
Supabase salta el RLS automáticamente cuando se usa la Service Key,
por diseño. Añadir una política para ello sería redundante e incorrecto.

### Rotación automática (trigger nativo)

`pg_cron` se detiene si el proyecto entra en pausa por inactividad en el
Free Tier. Se usa un trigger `AFTER INSERT` en `workflow_logs` para que
la limpieza ocurra en cada inserción, sin depender de servicios externos.

```sql
create or replace function purge_old_logs()
returns trigger language plpgsql as $$
begin
  -- borrar logs de más de 7 días
  delete from workflow_logs where ts < now() - interval '7 days';
  -- borrar runs terminados de más de 30 días (cascade elimina sus logs)
  delete from workflow_runs
    where updated_at < now() - interval '30 days'
      and conclusion is not null;
  return null;
end;
$$;

create trigger trg_purge_old_logs
after insert on workflow_logs
for each statement execute function purge_old_logs();
```

El trigger se dispara una vez por sentencia INSERT (no por fila), por lo
que el coste es mínimo incluso en inserciones batch.

---

## Step de GitHub Actions

Añadir al final de cada workflow que se quiera monitorizar:

```yaml
- name: Notify MLOps Dashboard
  if: always()
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
    RUN_ID: ${{ github.run_id }}
    REPO: ${{ github.repository }}
    BRANCH: ${{ github.ref_name }}
    WORKFLOW: ${{ github.workflow }}
    STATUS: ${{ job.status }}
  run: |
    curl -s -X POST "$SUPABASE_URL/rest/v1/workflow_runs" \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: resolution=merge-duplicates" \
      -d "{
        \"run_id\": $RUN_ID,
        \"repo\": \"$REPO\",
        \"branch\": \"$BRANCH\",
        \"workflow_name\": \"$WORKFLOW\",
        \"status\": \"$STATUS\",
        \"updated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }"
```

Para enviar logs en batch (dentro del step que genera logs):

```yaml
- name: Train model
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
    RUN_ID: ${{ github.run_id }}
  run: |
    python train.py 2>&1 | tee /tmp/train.log
    # enviar el bloque completo del step al finalizar (no línea a línea)
    LOG_CONTENT=$(head -c 100000 /tmp/train.log)
    curl -s -X POST "$SUPABASE_URL/rest/v1/workflow_logs" \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -d "[{
        \"run_id\": $RUN_ID,
        \"step_name\": \"train\",
        \"content\": $(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' < /tmp/train.log)
      }]"
```

---

## Variables de entorno en el frontend

```env
# .env (self-hosted, no se sube al repo)
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

La `ANON_KEY` es pública por diseño — RLS controla el acceso.
La `SERVICE_KEY` solo va en los secrets de GitHub, nunca en el frontend.

---

## Límites Free Tier Supabase — análisis realista

| recurso              | límite free | uso estimado (50 jobs/día, 500 líneas/job) |
|----------------------|-------------|---------------------------------------------|
| Almacenamiento BD    | 500 MB      | ~25 KB/job × 50 = 1.25 MB/día → 400 días   |
| Ancho de banda       | 5 GB/mes    | marginal (payloads pequeños)                |
| Conexiones Realtime  | 200         | 1 por instancia self-hosted activa          |
| Edge Functions       | no usadas   | —                                           |

Con la rotación a 7 días el almacenamiento se estabiliza en ~9 MB.
El free tier no es un problema en condiciones normales de un TFM.

---

## Decisión final

**Supabase** es la opción correcta por:
1. Escrituras ilimitadas desde GHA (REST sin límite de peticiones).
2. Push real en el cliente (Realtime WS, no polling).
3. Un solo servicio, SDK oficial para React/JS.
4. Free tier sostenible con política de rotación de logs.
5. Alineación con el patrón SSE/push ya establecido en el stack.
