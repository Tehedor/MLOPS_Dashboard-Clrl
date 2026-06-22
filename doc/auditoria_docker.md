# Auditoría Docker — app_ctrl_v2

Análisis de viabilidad de ejecutar la aplicación completa en contenedores Docker.

**Veredicto: NO ESTÁ PREPARADA.** El `docker-compose.yml` actual es un esqueleto incompleto. Hay 7 problemas bloqueantes que impiden que la app funcione dentro de contenedores.

---

## Resumen de hallazgos

| # | Severidad | Problema | Afecta a |
|---|---|---|---|
| 1 | **BLOQUEANTE** | `PROJECT_ROOT` se resuelve como `/` dentro del contenedor | Todo el backend |
| 2 | **BLOQUEANTE** | Faltan herramientas CLI en la imagen Docker | git, dvc, gh, make, bash |
| 3 | **BLOQUEANTE** | Volúmenes incompletos — falta `config/`, `external/`, `data/`, `services/` | Toda la funcionalidad |
| 4 | **BLOQUEANTE** | Docker-in-Docker: servicios externos lanzan `docker compose` | Vista Servicios |
| 5 | **BLOQUEANTE** | Frontend proxy apunta a `localhost:8000` (no resuelve al backend) | Toda la comunicación frontend→backend |
| 6 | **ALTO** | `localhost` en `check_status()` no alcanza contenedores de servicios | Vista Servicios |
| 7 | **MEDIO** | Symlinks de `data_ctrl` rompen en contenedores (rutas absolutas del host) | Setup de pipeline |

---

## 1. BLOQUEANTE — `PROJECT_ROOT` se resuelve como `/`

**Archivo:** `backend/app/core/config.py:9`

```python
PROJECT_ROOT = Path(__file__).resolve().parents[3]
```

En local, `__file__` es `.../app_ctrl_v2/backend/app/core/config.py`, así que `parents[3]` = `app_ctrl_v2/`.

En Docker, con el mount `./backend:/app`:
```
/app/app/core/config.py
 parents[0] = /app/app/core
 parents[1] = /app/app
 parents[2] = /app          ← esto sería lo correcto
 parents[3] = /             ← lo que calcula
```

**Consecuencia:** Todas las rutas derivadas (`config/config.yaml`, `config/pipelines.yaml`, `external/`, etc.) se resuelven desde `/`, haciendo que toda la aplicación falle.

**Fix necesario:** Cambiar `parents[3]` a `parents[2]` cuando se ejecuta en Docker, o usar una variable de entorno `APP_ROOT` para que sea configurable.

---

## 2. BLOQUEANTE — Herramientas CLI no instaladas en la imagen

El `Dockerfile` solo instala dependencias Python:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

Pero el backend ejecuta vía `subprocess` / `create_subprocess_shell`:

| Herramienta | Dónde se usa | Para qué |
|---|---|---|
| `git` | `repo_sync_service.py`, `local_runner_service.py`, `project_setup_service.py`, `variants_service.py` | Clone, fetch, pull, push, commit, branch, PR |
| `dvc` | `local_runner_service.py`, `variants_service.py` | DVC pull de artefactos, remote modify |
| `gh` (GitHub CLI) | `local_runner_service.py`, `variants_service.py` | Crear PRs, merge PRs, API calls |
| `make` | `services_service.py` | Lanzar/parar servicios Docker |
| `bash` | `lineage_service.py` | Ejecutar `scripts/run_generate_lineage.sh` |
| `python3` | `local_runner_service.py` | Crear venvs para el runner local |

Ninguna está en `python:3.12-slim`.

**Fix necesario:** Ampliar el Dockerfile:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    git make bash curl && rm -rf /var/lib/apt/lists/*
RUN pip install dvc[s3]
# gh CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [signed-by=...] ..." > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y gh
```

---

## 3. BLOQUEANTE — Volúmenes incompletos

El `docker-compose.yml` actual:

```yaml
volumes:
  - ./backend:/app          # solo el código del backend
  - backend_data:/app/data  # volume nombrado para data
```

El backend necesita acceso a directorios FUERA de `backend/`:

| Ruta (relativa a PROJECT_ROOT) | Quién la usa | Para qué |
|---|---|---|
| `config/config.yaml` | `core/config.py` | Configuración global |
| `config/pipelines.yaml` | `core/config.py` | Registro de pipelines |
| `config/<pipeline>/` | Múltiples servicios | Config por pipeline (table_config, fase_runners, lineage_config, etc.) |
| `external/` | `repo_sync_service.py`, `local_runner_service.py`, `variants_service.py`, `lineage_service.py` | Repos clonados, executions, artefactos |
| `data/` | `project_setup_service.py` | Inyección de data_ctrl (raw.csv) |
| `services/` | `services_service.py` | Makefile que lanza Docker Compose |
| `scripts/` | `lineage_service.py` | Shell scripts |
| `.env` (raíz) | `core/config.py` | Variables de entorno |

**Fix necesario:** Montar el proyecto completo, no solo `backend/`:

```yaml
backend:
  volumes:
    - .:/project              # todo el proyecto
    - ./backend:/app          # código backend (para uvicorn)
  working_dir: /app
```

O reestructurar para que PROJECT_ROOT sea configurable.

---

## 4. BLOQUEANTE — Docker-in-Docker (servicios externos)

`services_service.py` ejecuta:
```python
proc = await asyncio.create_subprocess_exec(
    "make", command,
    cwd=str(SERVICES_CWD),  # → PROJECT_ROOT / "services"
    ...
)
```

Los Makefile targets en `services/Makefile` hacen:
```makefile
run_temporal_app:
    @cd temporal_app && docker compose -f docker-compose.yml up -d

run_windows_app:
    @cd windows_app && docker compose -f docker-compose.yml up -d
```

Si el backend corre en un contenedor, estas llamadas a `docker compose` necesitan acceso al daemon Docker del host.

**Opciones:**

| Opción | Pros | Contras |
|---|---|---|
| Montar `/var/run/docker.sock` | Simple, funciona | Riesgo de seguridad: el contenedor tiene control total del host Docker |
| Docker-in-Docker (DinD) | Aislado | Complejidad, rendimiento, problemas con volumes |
| Dejar servicios fuera del contenedor | Sin DinD | El usuario debe lanzarlos manualmente |

**Si se elige socket mount:**
```yaml
backend:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

Y hay que instalar `docker-compose` dentro de la imagen del backend.

**Problema adicional:** Los Docker Compose de servicios montan rutas relativas al host:
```yaml
# services/temporal_app/docker-compose.yml
volumes:
  - ${EXECUTIONS_PATH:-../../external/repo_actions/executions}:/app/executions
```

Estas rutas relativas se resuelven desde el contexto del contenedor, no del host. Con socket mount, `docker compose` habla con el daemon del host pero las rutas son del filesystem del contenedor → los mounts fallan.

---

## 5. BLOQUEANTE — Frontend proxy no resuelve al backend

`fronted/vite.config.js`:
```javascript
proxy: {
  '/api': 'http://localhost:8000',
  '/executions': 'http://localhost:8000',
  '/ws': { target: 'ws://localhost:8000', ws: true },
},
```

Dentro del contenedor frontend, `localhost` se refiere a sí mismo, no al contenedor backend.

**Fix necesario:**
```javascript
proxy: {
  '/api': 'http://backend:8000',
  '/executions': 'http://backend:8000',
  '/ws': { target: 'ws://backend:8000', ws: true },
},
```

O usar una variable de entorno para el host del backend.

---

## 6. ALTO — `check_status()` usa `localhost`

`services_service.py:91`:
```python
r = await client.get(f"http://localhost:{port}")
```

Comprueba si un servicio Docker está corriendo haciendo HTTP a `localhost:{port}`. Si el backend está containerizado:
- Si los servicios corren en la red del host → `localhost` dentro del contenedor no los alcanza
- Necesitaría usar `host.docker.internal` (Docker Desktop) o la IP de la red bridge

---

## 7. MEDIO — Symlinks de data_ctrl cruzan fronteras de contenedor

`project_setup_service.py:294-297`:
```python
if DATA_CTRL_MODE == "symlink":
    dst_path.symlink_to(src_path)
```

Crea symlinks con rutas absolutas del host (`/home/user/Work/.../data/raw.csv` → `external/.../data/raw.csv`). Dentro de un contenedor, estas rutas absolutas no existen.

**Fix:** Cambiar `DATA_CTRL_MODE` a `"copy"` cuando se ejecuta en Docker, o usar rutas relativas.

---

## Lo que SÍ funciona en Docker

| Componente | Estado | Notas |
|---|---|---|
| FastAPI + uvicorn | OK | La imagen base y el CMD son correctos |
| SQLite (aiosqlite) | OK | Funciona en cualquier filesystem |
| PTY (`pty.openpty`, `termios`) | OK | Funciona en contenedores Linux (necesita `/dev/ptmx`, disponible por defecto) |
| `os.killpg` / `start_new_session` | OK | Process groups funcionan en contenedores |
| GitHub API (httpx) | OK | Llamadas HTTP salientes, sin problema |
| Supabase Realtime (websockets) | OK | Conexión WebSocket saliente |
| Terminal proxy (WebSocket a runners) | OK* | Solo si los runners son accesibles por red desde el contenedor (URLs externas) |
| SSE streaming | OK | Es HTTP estándar |

---

## Qué corre en Docker vs. en tu máquina

### Ejecuciones de fases del pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tu máquina (host)                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Backend FastAPI (ahora: directo / docker-compose: falla) │   │
│  │                                                          │   │
│  │  Ejecución "GitHub Actions" (runner=GH)                  │   │
│  │  → Solo hace dispatch HTTP a GitHub API                  │   │
│  │  → La ejecución real ocurre en GitHub cloud              │   │
│  │  → OK en Docker ✓                                        │   │
│  │                                                          │   │
│  │  Ejecución "Local" (runner=Local)                        │   │
│  │  → Clona repo, crea venv, ejecuta scripts Python         │   │
│  │  → Usa git, dvc, gh, make, python3 en SUBPROCESOS       │   │
│  │  → Necesita filesystem real con repos clonados           │   │
│  │  → Problemático en Docker ✗                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │ temporal_app  │  │ windows_app  │  ← contenedores Docker     │
│  │ (Docker)      │  │ (Docker)     │     lanzados por el        │
│  │ puerto 8050   │  │ puerto 8060  │     backend vía make       │
│  └──────────────┘  └──────────────┘                             │
│                                                                 │
│  ┌──────────────┐                                               │
│  │ Runners ESP32│  ← máquinas remotas (ttyd/serial)             │
│  │ (físicos)    │     accesibles por URL/WebSocket              │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

**No hay containerización anidada real para las fases del pipeline:**
- Las fases que van a **GitHub Actions** solo hacen un HTTP POST (dispatch) — el trabajo ocurre en la nube de GitHub.
- Las fases que van al **runner local** ejecutan subprocesos directamente en la máquina donde corre el backend.
- Los **servicios externos** (temporal_app, windows_app) SÍ son contenedores Docker lanzados desde el backend.

**El problema de containerización anidada solo aplica a la Vista Servicios** (temporal_app/windows_app), no a las fases del pipeline.

---

## Recomendación

### Opción A — No containerizar el backend (recomendada para desarrollo/TFM)

Dejar el backend corriendo directamente en el host (`make dev`). Solo containerizar para despliegue si es necesario.

**Por qué:** El backend está diseñado como un "controlador" que orquesta herramientas del sistema (git, dvc, gh, docker). Meterlo en un contenedor requiere replicar todo ese tooling y resolver DinD, sin beneficio real para un entorno single-user de TFM.

### Opción B — Docker solo para backend+frontend (sin local runner ni servicios)

Containerizar backend y frontend para la demo, deshabilitando:
- Ejecución local (solo GitHub Actions runners)
- Vista Servicios (lanzar servicios manualmente)

Requiere arreglar: problemas 1, 2, 3 y 5.

### Opción C — Containerización completa

Requiere arreglar los 7 problemas. El docker-compose necesitaría:

```yaml
services:
  backend:
    build:
      context: .                    # todo el proyecto como contexto
      dockerfile: backend/Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - .:/project                  # proyecto completo
      - /var/run/docker.sock:/var/run/docker.sock  # DinD
    env_file: .env
    environment:
      APP_ROOT: /project            # PROJECT_ROOT configurable
    working_dir: /project/backend
    restart: unless-stopped

  frontend:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./fronted:/app
      - ./config:/config:ro         # para YAML aliases de Vite
      - ./external:/external:ro     # para traceability_schema
    ports:
      - "5173:5173"
    environment:
      VITE_API_HOST: http://backend:8000
    command: sh -c "npm install && npm run dev -- --host"
    depends_on:
      - backend
```

Y el Dockerfile ampliar con git, dvc, gh, make, docker-compose-plugin.

---

## Checklist de cambios necesarios (si se elige Opción C)

- [ ] `core/config.py`: hacer PROJECT_ROOT configurable vía `APP_ROOT` env var
- [ ] `Dockerfile`: instalar git, dvc, gh CLI, make, bash, docker CLI
- [ ] `docker-compose.yml`: montar proyecto completo + docker.sock
- [ ] `vite.config.js`: proxy backend configurable por env var
- [ ] `services_service.py`: `check_status()` resolver host dinámicamente
- [ ] `project_setup_service.py`: usar `DATA_CTRL_MODE="copy"` en Docker
- [ ] `services/Makefile`: rutas de volumes absolutas/configurables para DinD
- [ ] `docker-compose.yml` de servicios: montar paths desde el proyecto, no relativos
- [ ] Frontend: pasar config YAML como volumes al contenedor Vite
