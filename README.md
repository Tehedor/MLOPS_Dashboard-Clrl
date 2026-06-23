# MLOps Control Dashboard

Dashboard de control y orquestación de pipelines MLOps para edge computing (ESP32).  
Permite lanzar, monitorizar y trazar variantes de modelos a lo largo de 8 fases de pipeline, desde la exploración de datos hasta la validación en hardware real.

---

## Índice

- [MLOps Control Dashboard](#mlops-control-dashboard)
  - [Índice](#índice)
  - [Requisitos previos](#requisitos-previos)
  - [Guía de despliegue](#guía-de-despliegue)
    - [Paso 1 — Variables de entorno](#paso-1--variables-de-entorno)
    - [Paso 2 — Configuración de pipelines](#paso-2--configuración-de-pipelines)
    - [Paso 3 — Arrancar la aplicación](#paso-3--arrancar-la-aplicación)
    - [Paso 4 — Supabase (opcional)](#paso-4--supabase-opcional)
      - [Configuración paso a paso](#configuración-paso-a-paso)
  - [Runners](#runners)
    - [Runners Kubernetes autoalojados (K8s)](#runners-kubernetes-autoalojados-k8s)
    - [Runners sobre microcontrolador ESP32](#runners-sobre-microcontrolador-esp32)
  - [Librerías del Backend (Python)](#librerías-del-backend-python)
  - [Librerías del Frontend (Node.js)](#librerías-del-frontend-nodejs)
    - [Dependencias de producción](#dependencias-de-producción)
    - [Dependencias de desarrollo](#dependencias-de-desarrollo)
  - [Variables de entorno](#variables-de-entorno)
    - [Variables requeridas](#variables-requeridas)
    - [Variables opcionales](#variables-opcionales)
    - [Variables de runners de terminal (en `config/config.yaml`)](#variables-de-runners-de-terminal-en-configconfigyaml)
  - [Ficheros de configuración](#ficheros-de-configuración)
  - [Instalación y arranque](#instalación-y-arranque)
    - [Opción A — Local (desarrollo)](#opción-a--local-desarrollo)
    - [Comandos útiles (Makefile)](#comandos-útiles-makefile)
  - [Vistas y funcionamiento](#vistas-y-funcionamiento)
  - [Estructura del proyecto](#estructura-del-proyecto)
  - [Registro de ficheros de configuración (detallado)](#registro-de-ficheros-de-configuración-detallado)
    - [Variables de entorno (`.env`)](#variables-de-entorno-env)
    - [GitHub Actions workflows — `external/repo_actions/.github/`](#github-actions-workflows--externalrepo_actionsgithub)
    - [Dependencias](#dependencias)

---

## Requisitos previos

| Herramienta | Versión mínima | Uso |
|---|---|---|
| Python | 3.12 | Backend FastAPI |
| Node.js | 20 | Frontend React + Vite |
| npm | 9+ | Gestor de paquetes frontend |
| pip | 23+ | Gestor de paquetes backend |
| SQLite | 3.x | Base de datos de ejecuciones (incluido en Python) |
| Docker + Docker Compose | 24+ / v2 | Despliegue containerizado (opcional) |
| Git | 2.x | Clonación de repos de pipeline |
| Make | 4.x | Automatización de tareas |

---

## Guía de despliegue

### Paso 1 — Variables de entorno

Copiar la plantilla y rellenar con valores reales:

```bash
cp .env.example .env
```
Ejemplo:   [.env.example]


| Variable | Requerida | Descripción |
|---|---|---|
| `GITHUB_TOKEN` | Sí | Token por defecto para GitHub API (dispatch + polling). Permisos: `repo`, `actions:read` |
| `GITHUB_TOKEN_EDGE` | No | Token específico para pipelines `mlops4rtedge` y `mlops4rtedgeI`. Si no existe, usa `GITHUB_TOKEN` |
| `GITHUB_TOKEN_EDGE_TS` | No | Token específico para pipeline `mlops4rtedgeTSI` |
| `GITHUB_TOKEN_EDGE_UNI` | No | Token específico para pipeline `mlops4rtedgeUniI` |
| `DAGSHUB_USER` | Sí | Usuario de DagsHub para acceso a MLflow |
| `DAGSHUB_TOKEN` | Sí | Token de DagsHub |
| `SUPABASE_URL` | No | URL del proyecto Supabase (`https://xxxxx.supabase.co`). Sin configurar, el dashboard usa polling a GitHub API |
| `SUPABASE_PUBLISHABLE_KEY` | No | Anon key de Supabase (pública). Habilita notificaciones push en tiempo real |
| `DATABASE_URL` | No | Ruta de la base de datos SQLite (por defecto: `executions.db`) |
| `QUEUE_LIMIT` | No | Límite de la cola de ejecuciones (por defecto: `50`) |

Los tokens por pipeline se asignan en `config/pipelines.yaml` con la clave `github_token_env`.
Cada pipeline busca la variable de entorno indicada ahí; si no existe, usa `GITHUB_TOKEN`.

### Paso 2 — Configuración de pipelines

Editar `config/pipelines.yaml` con los repos, ramas y rutas de cada pipeline.
Cada pipeline necesita al mínimo:

```yaml
pipelines:
  mi_pipeline:
    label: "Mi Pipeline"
    color: "#ef4444"
    repo: "org/repo"                    # repo de GitHub
    branch: "main"                      # rama a monitorizar
    external_base: "external/mi_pipe"   # directorio local de clonado
    github_token_env: "GITHUB_TOKEN"    # variable de entorno con el token
```

Los ficheros de configuración por pipeline se ubican en `config/<pipeline_id>/`:
- `fase_runners.yaml` — asignación fase → runner
- `table_config.yaml` — columnas de la tabla de variantes
- `lineage_config.yaml` — configuración del grafo de linaje
- `local_workflows.yaml` — steps del runner local
- `services_external_ctrl.yaml` — servicios externos controlados

### Paso 3 — Arrancar la aplicación

```bash
make install    # instalar dependencias (pip + npm)
make dev        # arrancar backend (8000) + frontend (5173)
```

### Paso 4 — Supabase (opcional)

**Supabase es opcional.** Sin configurar, el dashboard funciona normalmente usando polling directo a la API de GitHub para detectar completions, con unos segundos más de latencia. Con Supabase, recibe notificaciones push en tiempo real.

**¿Por qué Supabase?**

GitHub solo admite una URL de webhook por evento. Como la app es self-hosted (cada usuario tiene su instancia), Supabase actúa como **broker Pub/Sub** centralizando eventos de GitHub y distribuyéndolos a todas las instancias.

**Supabase es elegida por:**
1. Escrituras ilimitadas desde GitHub Actions (REST sin límite de peticiones)
2. Push real en el cliente (Realtime WebSocket, no polling)
3. Un solo servicio, SDK oficial para React/JS
4. Free tier sostenible con política de rotación de logs
5. Alineación con el patrón SSE/push ya establecido en el stack

El único cuello de botella es el almacenamiento (500 MB free tier), gestionable con rotación agresiva (7 días para logs, 30 días para runs).

**Arquitectura multi-repo**

El dashboard opera con múltiples repos de pipeline simultáneamente. Cada repo necesita su propio webhook apuntando a la misma Edge Function de Supabase.

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

**Flujo de datos:**

1. Un workflow completa en cualquiera de los 3 repos
2. GitHub envía un evento `workflow_run` al webhook de la Edge Function
3. La Edge Function extrae `repo`, `branch`, `fase` (prefijo `f0N`), `variant` y `conclusion`
4. Escribe/actualiza el registro en `workflow_runs` y los logs en `workflow_logs`
5. Supabase Realtime notifica a todas las instancias suscritas
6. El backend resuelve el `pipeline_id` desde `repo+branch` y ejecuta `force_pull` solo para ese pipeline
7. El frontend muestra el cambio de estado en tiempo real

**Inferencia dinámica de fase**

La Edge Function extrae el **número de fase** del nombre del job o workflow:
- Job del orquestador: `trigger-fase5` → `5` → `f05`
- Workflow reusable: `"Reusable: Fase 5 (Modeling)"` → `5` → `f05`

Almacena solo el prefijo `f0N` en Supabase. El backend y frontend resuelven el nombre completo (`f05` → `f05_modeling`) desde sus YAMLs de configuración. Esto elimina la necesidad de mantener una lista de fases sincronizada.

#### Configuración paso a paso

**1. Crear proyecto en Supabase**

1. Ir a [supabase.com](https://supabase.com) y crear un proyecto. Dentro de este proyecto:
2. Anotar:
   - **Project URL**: `https://xxxxx.supabase.co`  
    (Project Settings → General |> General Settings | project id)
    {.env - SUPABASE_URL=https://xxxxx.supabase.co}
   - **Publishable key** (pública): `sb_publishable_XXXXX`  
     (Project Settings → API keys |> Publishable and secret API keys→ Publishable key)
    {.env - SUPABASE_PUBLISHABLE_KEY=sb_publishable_XXXXX}
   - **Secret keys** (privada): `sb_secret_XXXX`  
     (Project Settings → API keys |> Publishable and secret API keys→ Secret keys)
     {.env - SERVICE_ROLE_KEY=XXXXX}
   - **acess token** : `sb_secret_XXXX`
    (Avatar -> Account -> Acess Tokens)
    {.env -> } 

**2. Crear tablas**

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

**3. Habilitar Realtime**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_logs;
```

**4. Row Level Security**

```sql
alter table workflow_runs enable row level security;
create policy "anon read" on workflow_runs for select using (true);

alter table workflow_logs enable row level security;
create policy "anon read" on workflow_logs for select using (true);

-- RLS y los permisos SQL son capas independientes. Sin estos GRANT,
-- PostgREST y la Edge Function responden "permission denied for table".
grant usage on schema public to anon, service_role;

grant select
on table public.workflow_runs, public.workflow_logs
to anon;

grant select, insert, update, delete
on table public.workflow_runs, public.workflow_logs
to service_role;
```

La clave privada `sb_secret_...` usa el rol `service_role` y salta RLS,
pero sigue necesitando los permisos SQL anteriores sobre las tablas.

**5. Rotación automática (trigger)**

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

Con la rotación a 7 días el almacenamiento se estabiliza en ~9 MB.

**6. Desplegar la Edge Function**

```bash
cd supabase/
supabase functions deploy github-webhook
```

Configurar secrets de la Edge Function:

```bash
supabase secrets set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
supabase secrets set WEBHOOK_SECRET=un_secreto_aleatorio
```

La Edge Function infiere la fase dinámicamente desde el nombre del job/workflow — no necesita configuración adicional.

**7. Configurar webhooks en GitHub**

En **cada uno** de los 3 repos, ir a Settings → Webhooks → Add webhook:

| Campo | Valor |
|---|---|
| **Payload URL** | `https://<proyecto>.supabase.co/functions/v1/github-webhook` |
| **Content type** | `application/json` |
| **Secret** | El mismo valor configurado en `WEBHOOK_SECRET` |
| **Events** | Let me select individual events: **Workflow runs** |
| **SSL Verification** | Enabled|

Repos que necesitan webhook:
- `TeheORG/mlops4rtedge`
- `TeheORG/mlops4rtedgeUni`
- `TeheORG/mlops4rtedgeTS`

**8. Configurar variables en el dashboard**

En el `.env` del proyecto (raíz):

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_***
```

**Límites Free Tier**

| recurso              | límite free | uso estimado (50 jobs/día, 500 líneas/job) |
|---|---|---|
| Almacenamiento BD    | 500 MB      | ~25 KB/job × 50 = 1.25 MB/día → 400 días   |
| Ancho de banda       | 5 GB/mes    | marginal (payloads pequeños)                |
| Conexiones Realtime  | 200         | 1 por instancia self-hosted activa          |
| Edge Functions       | 500K inv/mes | ~150/día × 30 = 4.500/mes                  |

**Sin Supabase (modo por defecto)**

Cuando `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` están vacíos:

- **Backend**: El servicio `supabase_sync_service` se desactiva silenciosamente. El polling de `execution_service._poll_gh_running()` detecta completions cada `POLL_GH_SECS` consultando directamente la API de GitHub
- **Frontend**: `isConfigured()` devuelve `false`, las queries de Supabase devuelven `[]`, la vista LogsRunners queda sin datos de GHA
- **Funcionalidad intacta**: ejecuciones locales, dispatch, colas, variantes, lineaje, terminal — todo funciona normalmente sin Supabase

---

## Runners

Los pipelines pueden ejecutarse en distintos tipos de runners según la fase.
Las fases 1-6 usan GitHub Actions (cloud) o runners Kubernetes autoalojados.
Las fases 7-8 (validación en hardware) usan runners sobre microcontroladores ESP32.

### Runners Kubernetes autoalojados (K8s)

Runners autoalojados con ARC (Actions Runner Controller) en un clúster Kubernetes.
Proporcionan runners `K8s-8gb` y `K8s-24gb` para fases de cómputo intensivo.

- **Para un solo repo**: [doc_runners/runnerK8s/desplegar_ctrl.md](doc_runners/runnerK8s/desplegar_ctrl.md)
- **Para una organización** (recomendado si se usan varios repos): [doc_runners/runnerK8s/desplegar_ctrlORG.md](doc_runners/runnerK8s/desplegar_ctrlORG.md)

### Runners sobre microcontrolador ESP32

Runners autoalojados que ejecutan las fases de validación en hardware edge real o emulado.
Cada runner incluye una terminal web (TTYD), un túnel Cloudflare y un GitHub Actions Runner.

- **ESP32 físico**: [doc_runners/runnerMicrocontrolador/Readme.md](doc_runners/runnerMicrocontrolador/Readme.md)
- **ESP32 virtual** (emulación QEMU, sin hardware real): [doc_runners/runnerMicrocontroladorVirtual/README.md](doc_runners/runnerMicrocontroladorVirtual/README.md)

---

## Librerías del Backend (Python)

Definidas en `backend/requirements.txt`:

| Librería | Versión | Propósito |
|---|---|---|
| `fastapi` | >=0.111.0 | Framework web asíncrono — API REST y WebSockets |
| `uvicorn[standard]` | >=0.29.0 | Servidor ASGI con hot-reload |
| `httpx` | >=0.27.0 | Cliente HTTP asíncrono — comunicación con GitHub API |
| `pydantic-settings` | >=2.2.0 | Carga de configuración desde variables de entorno |
| `aiosqlite` | >=0.20.0 | Driver SQLite asíncrono para persistencia de ejecuciones |
| `python-dotenv` | >=1.0.0 | Carga de ficheros `.env` |
| `pyyaml` | >=6.0.0 | Parseo de ficheros YAML de configuración |
| `sse-starlette` | >=2.1.0 | Server-Sent Events para streaming de logs en tiempo real |
| `websockets` | >=12.0 | WebSockets para terminal remota (Xterm.js) y Supabase Realtime |

Librerías estándar de Python utilizadas: `asyncio`, `pathlib`, `json`, `csv`, `subprocess`, `pty`, `termios`, `signal`, `shlex`, `shutil`, `tempfile`, `uuid`, `re`, `glob`, `logging`, `base64`, `time`, `os`.

---

## Librerías del Frontend (Node.js)

Definidas en `fronted/package.json`:

### Dependencias de producción

| Librería | Versión | Propósito |
|---|---|---|
| `react` | ^18.3.1 | Framework UI |
| `react-dom` | ^18.3.1 | Renderizado DOM de React |
| `react-router-dom` | ^6.26.0 | Routing SPA — navegación entre vistas |
| `@tanstack/react-query` | ^5.51.1 | Gestión de estado asíncrono y caché de datos del servidor |
| `reactflow` | ^11.11.4 | Grafos interactivos — visualización del linaje de variantes |
| `@xterm/xterm` | ^6.0.0 | Emulador de terminal — consola remota a runners ESP32 |
| `@xterm/addon-fit` | ^0.11.0 | Auto-resize del terminal Xterm.js |
| `ansi-to-html` | ^0.7.2 | Conversión de códigos ANSI a HTML para logs coloreados |
| `clsx` | ^2.1.1 | Utilidad para clases CSS condicionales |
| `@supabase/supabase-js` | ^2.104.1 | Cliente Supabase — escucha Realtime de completions de workflow |

### Dependencias de desarrollo

| Librería | Versión | Propósito |
|---|---|---|
| `vite` | ^5.3.5 | Bundler y dev server con HMR |
| `@vitejs/plugin-react` | ^4.3.1 | Plugin Vite para JSX/React Fast Refresh |
| `tailwindcss` | ^3.4.7 | Framework CSS utility-first |
| `postcss` | ^8.4.40 | Procesador CSS (requerido por Tailwind) |
| `autoprefixer` | ^10.4.19 | Añade prefijos vendor CSS automáticamente |
| `yaml` | ^2.8.3 | Parseo de YAML en Vite config — carga de esquemas de trazabilidad |

---

## Variables de entorno

La aplicación carga variables de entorno desde dos ubicaciones (la última gana en caso de conflicto):

1. `config/.env` — fallback compartido
2. `.env` — override principal (raíz del proyecto)

### Variables requeridas

```bash
# ── GitHub ─────────────────────────────────────────────────
# Token por defecto para GitHub API (dispatch de workflows, polling de runs)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Tokens específicos por pipeline (opcionales — si no existen, usa GITHUB_TOKEN)
GITHUB_TOKEN_EDGE=ghp_xxxxxxxxxxxxxxxxxxxx        # mlops4rtedge + mlops4rtedgeI
GITHUB_TOKEN_EDGE_TS=ghp_xxxxxxxxxxxxxxxxxxxx      # mlops4rtedgeTSI
GITHUB_TOKEN_EDGE_UNI=ghp_xxxxxxxxxxxxxxxxxxxx     # mlops4rtedgeUniI

# ── DagsHub / MLflow ──────────────────────────────────────
DAGSHUB_USER=tu_usuario_dagshub
DAGSHUB_TOKEN=tu_token_dagshub

# ── Supabase (opcional — notificaciones Realtime) ─────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Variables opcionales

```bash
# Base de datos (por defecto: executions.db en el directorio backend/)
DATABASE_URL=executions.db

# Límite de la cola de ejecuciones (por defecto: 50)
QUEUE_LIMIT=50

```

### Variables de runners de terminal (en `config/config.yaml`)

Los runners de terminal se configuran en `config/config.yaml`, no en `.env`.  
Cada runner necesita URL, usuario y contraseña como variables de entorno:

```bash
# Runner 1 — ESP32 físico
RUNNER1_URL=https://runner1.example.com
RUNNER1_USERNAME=user
RUNNER1_PASSWORD=pass

# Runner 2-4 — ESP32 adicionales / virtuales
RUNNER2_URL=https://runner2.example.com
RUNNER2_USERNAME=user
RUNNER2_PASSWORD=pass
# ... etc
```

---

## Ficheros de configuración

| Fichero | Descripción |
|---|---|
| `config/config.yaml` | Configuración global: intervalos de sync, runners de terminal, fases |
| `config/pipelines.yaml` | Registro de pipeline-projects: repos, ramas, rutas, tokens |
| `config/fases_execution_runners.yaml` | Definición de las 8 fases con runners y concurrencia |
| `config/<pipeline>/fase_runners.yaml` | Asignación fase-runner por pipeline |
| `config/<pipeline>/table_config.yaml` | Configuración de la tabla de variantes por pipeline |
| `config/<pipeline>/lineage_config.yaml` | Configuración del grafo de linaje por pipeline |
| `config/<pipeline>/local_workflows.yaml` | Definición de steps del runner local |
| `config/<pipeline>/services_external_ctrl.yaml` | Servicios externos controlados |
| `docker-compose.yml` | Compose: backend (puerto 8000) + frontend (puerto 5173) |
| `backend/Dockerfile` | Imagen Python 3.12-slim con uvicorn |
| `fronted/vite.config.js` | Config Vite: proxy a backend, aliases YAML, plugin YAML |
| `fronted/tailwind.config.js` | Config Tailwind: dark mode por clase |
| `fronted/postcss.config.js` | PostCSS: Tailwind + Autoprefixer |

---

## Instalación y arranque

### Opción A — Local (desarrollo)

```bash
# 1. Clonar e instalar dependencias
make install            # equivalente a: pip install + npm install

# 2. Crear fichero de variables de entorno
cp .env.example .env    # editar y rellenar tokens reales

# 3. (Opcional) Desplegar Edge Function de Supabase
make supabase-deploy

# 4. Arrancar backend + frontend en background
make dev

# Backend:  http://localhost:8000      (API + docs en /docs)
# Frontend: http://localhost:5173      (proxy /api → backend)
```

### Comandos útiles (Makefile)

```bash
make help               # Ver todos los comandos disponibles
make status             # Estado de los procesos
make logs               # Seguir logs de ambos servicios
make restart            # Reiniciar todo
make stop               # Parar todo
make db-shell           # Shell SQLite interactivo
make db-dump            # Volcar tabla de ejecuciones
make lint               # Lint backend (ruff) + frontend (eslint)
make fmt                # Formatear código
make build              # Build de producción del frontend
make clean              # Parar y limpiar artefactos
```

---

## Vistas y funcionamiento

Documentación completa de las 7 vistas, mockups ASCII, flujo de datos y mapa de componentes: **[doc/vistas_aplicacion.md](doc/vistas_aplicacion.md)**

---

## Estructura del proyecto

```
app_ctrl_v2/
├── backend/                    # Backend FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/routers/        # Endpoints REST + WebSocket
│   │   ├── core/               # Config, DB, settings
│   │   ├── schemas/            # Modelos Pydantic
│   │   └── services/           # Lógica de negocio
│   ├── requirements.txt
│   ├── Dockerfile
│   └── executions.db           # SQLite (generado en runtime)
├── fronted/                    # Frontend React + Vite
│   ├── src/
│   │   ├── api/                # Funciones cliente HTTP
│   │   ├── components/         # UI compartida (ui/ + layout/)
│   │   ├── features/           # Módulos de funcionalidad
│   │   │   ├── lineage/        # Grafo de linaje (React Flow)
│   │   │   ├── logs/           # Logs en tiempo real (SSE + ANSI)
│   │   │   ├── vista2/         # Vista de consulta y dispatch
│   │   │   └── ...
│   │   ├── pages/              # Páginas de la SPA
│   │   └── utils/
│   ├── package.json
│   └── vite.config.js
├── config/                     # YAMLs de configuración
│   ├── config.yaml
│   ├── pipelines.yaml
│   └── <pipeline>/             # Config por pipeline
├── external/                   # Repos clonados de pipeline (runtime)
├── scripts/                    # Scripts auxiliares
├── docker-compose.yml
├── Makefile
└── .env                        # Variables de entorno (no versionado)
```

---

## Registro de ficheros de configuración (detallado)

### Variables de entorno (`.env`)

| Archivo | Descripción | En `.gitignore` |
|---|---|---|
| `.env.example` | Plantilla raíz de variables de entorno | No |
| `backend/.env` | Variables activas del backend FastAPI | Si |
| `backend/.env.example` | Plantilla del backend | No |

### GitHub Actions workflows — `external/repo_actions/.github/`

| Archivo | Descripción |
|---|---|
| `workflows/61_mlops_Orchestator_trigger.yml` | Workflow orquestador — recibe dispatch y lanza la fase |
| `workflows/Build_Docker_job_container.yml` | Build imagen Docker de job containers |
| `workflows/reusable_fase1-Explore.yml` | Fase 1: Exploración |
| `workflows/reusable_fase2-PrepareEvents.yml` | Fase 2: Preparación de eventos |
| `workflows/reusable_fase3-PrepareWindows.yml` | Fase 3: Preparación de ventanas |
| `workflows/reusable_fase4-TargetEngineering.yml` | Fase 4: Ingeniería de targets |
| `workflows/reusable_fase5-Modeling.yml` | Fase 5: Modelado |
| `workflows/reusable_fase6-Quantiza&packageForEdge.yml` | Fase 6: Cuantización y empaquetado edge |
| `workflows/reusable_fase7-ValidateModelEdgeHardware.yml` | Fase 7: Validación hardware edge (ESP32) |
| `workflows/reusable_fase8-ValidateMulti-ModelEdgeSystem.yml` | Fase 8: Validación multi-modelo |

### Dependencias

| Archivo | Descripción |
|---|---|
| `backend/requirements.txt` | Dependencias Python del backend FastAPI |
| `fronted/package.json` | Dependencias Node del frontend React |
