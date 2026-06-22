# MLOps Control Dashboard

Dashboard de control y orquestación de pipelines MLOps para edge computing (ESP32).  
Permite lanzar, monitorizar y trazar variantes de modelos a lo largo de 8 fases de pipeline, desde la exploración de datos hasta la validación en hardware real.

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

# Repo legacy (para backward compat con supabase_sync_service)
GITHUB_REPO=TeheORG/mlops4rtedge
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

### Opción B — Docker Compose

```bash
# 1. Configurar variables de entorno
cp .env.example .env    # editar tokens

# 2. Build + arrancar
docker compose up -d --build

# Backend:  http://localhost:8000
# Frontend: http://localhost:5173
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
