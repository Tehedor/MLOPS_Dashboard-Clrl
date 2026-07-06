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
      - [Paso 2.1 — Configurar el workflow automático de Pull Requests](#paso-21--configurar-el-workflow-automático-de-pull-requests)
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
| [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | Última estable | Despliegue de la Edge Function y configuración de secretos (opcional; `make supabase-deploy` la instala automáticamente si no está disponible) |

---

## Guía de despliegue

### Paso 1 — Variables de entorno

Copiar la plantilla y rellenar con valores reales:

```bash
cp .env.example .env
```

**📖 Guía completa de tokens de GitHub:** [doc/github_tokens_setup.md](doc/github_tokens_setup.md) (cómo generarlos, tipos, permisos y troubleshooting)

| Variable | Requerida | Descripción |
|---|---|---|
| `GITHUB_TOKEN` | Sí | Token por defecto para GitHub API (dispatch + polling). Token Classic con scope `repo`, o Fine-grained con `Contents: read-write`, mejor hacerlo por repo |
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

#### Paso 2.1 — Configurar el workflow automático de Pull Requests

Para que los workflows puedan crear y fusionar Pull Requests automáticamente:

1. Habilitar permisos de lectura y escritura para GitHub Actions en la organización y en cada repositorio.
2. Permitir que GitHub Actions cree y apruebe Pull Requests.
3. Revisar las reglas de protección de la rama base para que no bloqueen el merge automático.
4. Verificar que los workflows declaren los permisos `contents: write` y `pull-requests: write`.

Consulta las rutas exactas de configuración, las alternativas de protección de ramas y el checklist por repositorio en la **[guía del workflow automático de Pull Requests](doc/github_actions_autoPR.md)**.

### Paso 3 — Arrancar la aplicación

```bash
make install    # instalar dependencias (pip + npm)
make dev        # arrancar backend (8000) + frontend (5173)
```

### Paso 4 — Supabase (opcional)

**Supabase es opcional.** Sin configurar, el dashboard funciona normalmente usando polling directo a la API de GitHub para detectar completions, con unos segundos más de latencia. Con Supabase, recibe notificaciones push en tiempo real.

**¿Por qué Supabase?**
- GitHub solo admite una URL de webhook por evento. Como la app es self-hosted, Supabase actúa como broker Pub/Sub centralizando eventos.
- Escrituras ilimitadas desde GitHub Actions, push real en el cliente vía WebSocket, free tier sostenible con rotación de logs.

**Variables de entorno (en `.env`):**

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_***
```

**Guía de configuración completa:** [doc/supabase.md](doc/supabase.md)

Incluye paso a paso:
1. Crear proyecto en Supabase
2. Crear tablas y configurar RLS
3. Habilitar Realtime y rotación de logs
4. Desplegar Edge Function (`make supabase-deploy`)
5. Configurar webhooks en GitHub

**Sin Supabase (modo por defecto):**
Cuando estas variables están vacías:
- Backend: El polling de `execution_service` detecta completions consultando directamente la API de GitHub
- Frontend: La vista de GHA no recibe datos, pero el resto de funcionalidades (ejecuciones locales, dispatch, colas, variantes, lineaje) sigue intacta

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
