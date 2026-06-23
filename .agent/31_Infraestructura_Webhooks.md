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

## Decisión: Supabase

**Supabase** (PostgreSQL + REST + Realtime) es la opción elegida por:
1. Escrituras ilimitadas desde GHA (REST sin límite de peticiones).
2. Push real en el cliente (Realtime WS, no polling).
3. Un solo servicio, SDK oficial para React/JS.
4. Free tier sostenible con política de rotación de logs.
5. Alineación con el patrón SSE/push ya establecido en el stack.

El único cuello de botella es el almacenamiento (500 MB free tier),
gestionable con rotación agresiva (7 días para logs, 30 días para runs).

**Supabase es opcional.** Sin configurar, el dashboard funciona
normalmente usando polling directo a la API de GitHub para detectar
completions y sin la vista de logs de GHA.

---

## Arquitectura multi-repo

El dashboard opera con múltiples repos de pipeline simultáneamente.
Cada repo necesita su propio webhook apuntando a la misma Edge Function.

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Actions                                                     │
│                                                                     │
│  TeheORG/mlops4rtedge       (ramas: test, mlops4rtedge_ines)       │
│  TeheORG/mlops4rtedgeUni    (rama:  mlops4rtedgeUni_ines)          │
│  TeheORG/mlops4rtedgeTS     (rama:  mlops4rtedgeTS_ines)           │
│                                                                     │
│  Cada repo tiene un webhook configurado ─────────────────────┐     │
└──────────────────────────────────────────────────────────────┼─────┘
                                                               │
                                                               ▼
                              ┌─────────────────────────┐
                              │       SUPABASE          │
                              │  Edge Function          │
                              │    (github-webhook)     │
                              │        ↓                │
                              │  PostgreSQL             │
                              │    workflow_runs        │
                              │    workflow_logs         │
                              │        ↓                │
                              │  Realtime WS (push)     │
                              └────────────┬────────────┘
                                           │  WebSocket (anon key)
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                   instancia A      instancia B      instancia C
                   (self-hosted)   (self-hosted)   (self-hosted)
```

### Flujo de datos

1. Un workflow completa en cualquiera de los 3 repos.
2. GitHub envía un evento `workflow_run` al webhook de la Edge Function.
3. La Edge Function extrae `repo`, `branch`, `fase` (prefijo `f0N`), `variant` y `conclusion`.
4. Escribe/actualiza el registro en `workflow_runs` y los logs en `workflow_logs`.
5. Supabase Realtime notifica a todas las instancias suscritas.
6. El `supabase_sync_service.py` del backend recibe el evento, resuelve
   el `pipeline_id` desde `repo+branch` (contra `pipelines.yaml`), y
   ejecuta `force_pull(pipeline_id)` solo para ese pipeline.
7. El frontend muestra el cambio de estado en tiempo real.

### Inferencia de fase (dinámica, sin configuración)

La Edge Function extrae el **número de fase** del nombre del job o workflow:
- Job del orquestador: `trigger-fase5` → `5` → `f05`
- Workflow reusable: `"Reusable: Fase 5 (Modeling)"` → `5` → `f05`

Almacena solo el prefijo `f0N` en Supabase. El backend y frontend
resuelven el nombre completo (`f05` → `f05_modeling`) desde sus YAMLs
de configuración (`config/<pipeline>/fase_runners.yaml`).

Esto elimina la necesidad de mantener una lista de fases sincronizada
entre la Edge Function y el dashboard.

---

## Configuración paso a paso

### 1. Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y crear un proyecto.
2. Anotar:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon key** (pública): `eyJ...` (Settings → API → anon public)
   - **service_role key** (privada): `eyJ...` (Settings → API → service_role secret)

### 2. Crear tablas

Ejecutar en el SQL Editor de Supabase:

```sql
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

create table workflow_logs (
  id        uuid primary key default gen_random_uuid(),
  run_id    bigint not null references workflow_runs(run_id) on delete cascade,
  step_name text,
  line_no   int,
  content   text,
  ts        timestamptz default now()
);

create index on workflow_logs(run_id, line_no);
```

### 3. Habilitar Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_logs;
```

### 4. Row Level Security

```sql
alter table workflow_runs enable row level security;
create policy "anon read" on workflow_runs for select using (true);

alter table workflow_logs enable row level security;
create policy "anon read" on workflow_logs for select using (true);
```

Escritura con `service_role` key salta RLS automáticamente.

### 5. Rotación automática (trigger)

```sql
create or replace function purge_old_logs()
returns trigger language plpgsql as $$
begin
  delete from workflow_logs where ts < now() - interval '7 days';
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

### 6. Desplegar la Edge Function

```bash
cd supabase/
supabase functions deploy github-webhook
```

Configurar secrets de la Edge Function:

```bash
supabase secrets set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
supabase secrets set WEBHOOK_SECRET=un_secreto_aleatorio
```

> `PHASES_LIST` ya no es necesario — la Edge Function infiere la fase
> dinámicamente desde el nombre del job/workflow.

### 7. Configurar webhooks en GitHub

En **cada uno** de los 3 repos, ir a Settings → Webhooks → Add webhook:

| Campo | Valor |
|---|---|
| **Payload URL** | `https://<proyecto>.supabase.co/functions/v1/github-webhook` |
| **Content type** | `application/json` |
| **Secret** | El mismo valor configurado en `WEBHOOK_SECRET` |
| **Events** | Seleccionar solo: **Workflow runs** |

Repos que necesitan webhook:
- `TeheORG/mlops4rtedge`
- `TeheORG/mlops4rtedgeUni`
- `TeheORG/mlops4rtedgeTS`

### 8. Configurar variables en el dashboard

En el `.env` del proyecto (raíz):

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJ...  # anon key (pública)
```

> La `service_role` key solo va en los secrets de Supabase/GitHub.
> La `anon` key es pública por diseño — RLS controla el acceso.

---

## Límites Free Tier

| recurso              | límite free | uso estimado (50 jobs/día, 500 líneas/job) |
|----------------------|-------------|---------------------------------------------|
| Almacenamiento BD    | 500 MB      | ~25 KB/job × 50 = 1.25 MB/día → 400 días   |
| Ancho de banda       | 5 GB/mes    | marginal (payloads pequeños)                |
| Conexiones Realtime  | 200         | 1 por instancia self-hosted activa          |
| Edge Functions       | 500K inv/mes | ~150/día × 30 = 4.500/mes                  |

Con la rotación a 7 días el almacenamiento se estabiliza en ~9 MB.

---

## Sin Supabase (modo actual)

Cuando `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` están vacíos:

- **Backend**: `supabase_sync_service` se desactiva silenciosamente.
  El polling de `execution_service._poll_gh_running()` detecta
  completions cada `POLL_GH_SECS` consultando la API de GitHub.
- **Frontend**: `isConfigured()` devuelve `false`, las queries de
  Supabase devuelven `[]`, la vista LogsRunners queda sin datos de GHA.
- **Funcionalidad intacta**: ejecuciones locales, dispatch, colas,
  variantes, lineaje, terminal — todo funciona sin Supabase.
