# Trigger de Ejecuciones — Soluciones implementadas

Documento técnico de las mejoras aplicadas al mecanismo de dispatch/trigger de la vista de Ejecuciones.

---

## 1. Contexto: flujo de dispatch

Cuando el usuario pulsa **Ejecutar** en una PhaseCard o en el Batch, la ejecución pasa por estos estados:

```
queued → waiting_parent? → waiting_runner? → dispatching → running → success|failed|canceled
```

El trigger real ocurre en `execution_service.py → _dispatch()` y tiene dos destinos:
- **GitHub Actions** → `github.py → dispatch_phase()` (evento `repository_dispatch`)
- **Local runner** → `local_runner_service.py → run_local_phase()`

---

## 2. Multi-pipeline: dispatch por repo y branch

**Problema anterior:** `dispatch_phase()` usaba un único repo/branch global hardcodeado en `config.yaml`. Con multi-pipeline hay dos problemas nuevos:

1. **Repo**: cada pipeline-project puede apuntar a repos distintos.
2. **Branch**: el workflow de GitHub leía el `checkout_branch` del archivo `.mlops4ofp/setup.yaml` que existe en el repo — pero con varios pipelines en el mismo repo, ese archivo solo tiene la branch de uno de ellos. Además, antes había runners con IP estática conocida; ahora el runner se asigna dinámicamente y hay que indicarlo explícitamente.

**Solución:** Pasar `checkout_branch` (y `runner`) directamente en el `client_payload` del `repository_dispatch`. El workflow lo usa si viene en el payload; si no, cae al fichero local (backward compat).

---

### Ejemplo completo de llamada al trigger

**1. El usuario pulsa Ejecutar en PhaseCard (frontend):**
```js
// PhaseCard.jsx
createExecution({
  pipeline_id:     "testPipelineEpoch",   // ← branch "test2"
  fase:            "f01_explore",
  variant:         "v1_0003",
  parent:          null,
  params:          { "RAW": "data/raw.csv", "EPOCHS": 10 },
  selected_runner: "runner-8gb",
})
```

**2. Backend crea la ejecución y dispara el task asyncio:**
```
POST /api/executions  →  201  { id: "uuid", status: "queued", ... }
asyncio.create_task(_dispatch(ex))
```

**3. `_dispatch()` construye el payload y llama a GitHub API:**
```python
# execution_service.py
proj   = get_pipeline_project("testPipelineEpoch")
repo   = proj["repo"]     # "Tehedor/MLOps_actions_v2"
branch = proj["branch"]   # "test2"
gh_run_id = await dispatch_phase(
    repo, "f01_explore", "v1_0003",
    parent=None,
    params={"RAW": "data/raw.csv", "EPOCHS": 10},
    runner_json='["runner-8gb"]',
    branch="test2",
)
```

**4. Petición HTTP real a la GitHub API:**
```http
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Authorization: Bearer {GITHUB_TOKEN}
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase":            "f01_explore",
    "variant_id":      "v1_0003",
    "params":          { "RAW": "data/raw.csv", "EPOCHS": "10" },
    "runner":          ["runner-8gb"],
    "checkout_branch": "test2"
  }
}
```

**5. El workflow de GitHub (`trigger_orchestrator.yml`) recibe el dispatch:**

El paso `Leer configuración de rama` debe priorizarlo sobre el fichero local:
```python
# En el workflow — paso "Leer configuración de rama"
import json, yaml, os

payload = json.loads(os.environ.get("CLIENT_PAYLOAD", "{}"))

# Prioridad 1: viene directo en el payload (multi-pipeline)
checkout_branch = payload.get("checkout_branch")

# Prioridad 2 (fallback): leer del fichero de setup local
if not checkout_branch:
    try:
        with open(".mlops4ofp/setup.yaml") as f:
            config = yaml.safe_load(f) or {}
        checkout_branch = config.get("git", {}).get("branch", "test")
    except Exception:
        checkout_branch = "test"

with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
    fh.write(f"checkout_branch={checkout_branch}\n")
```

**6. Los reusable workflows hacen checkout de la branch correcta:**
```yaml
- name: Checkout del codigo
  uses: actions/checkout@v4
  with:
    fetch-depth: 0
    ref: ${{ inputs.checkout_branch }}   # ← "test2"
    token: ${{ secrets.GITHUB_TOKEN }}
```

**7. Backend detecta el `gh_run_id` y actualiza el estado:**
```python
# github.py — _find_run_after()
# Busca en los últimos runs de repository_dispatch creados tras el dispatch_ts
# Retorna el run_id si lo encuentra (3 reintentos: 3s, 5s, 8s, 12s)
gh_run_id = await _find_run_after(repo, dispatch_ts)
# → "13485729301"

await self._set_gh_run_id(ex.id, gh_run_id)
await self._update_status(ex.id, ExecutionStatus.running)
```

**8. Poll en background cada 10 s hasta completar:**
```python
# _poll_gh_running() — cada 10s
GET https://api.github.com/repos/Tehedor/MLOps_actions_v2/actions/runs/13485729301
→ { "status": "completed", "conclusion": "success" }
→ UPDATE executions SET status='success' WHERE id='uuid'
→ repo_sync_service.force_pull("testPipelineEpoch")  # pull resultados
```

---

### Tabla resumen: qué campo lleva qué

| Campo en `client_payload` | Origen en backend | Usado en workflow |
|---|---|---|
| `fase` | `ExecutionCreate.fase` (normalizado) | `validar-payload` → selecciona trigger-faseN |
| `variant_id` | `ex.variant` | Todos los reusable workflows |
| `parent_variant` | `ex.parent` | Fases 2-7 |
| `parents_variant` | `ex.parent` (JSON array) | Fase 8 |
| `params` | `ex.params` → `_normalize_params()` | Cada workflow → `make variantN` |
| `runner` | `_get_runner_json(ex.runner)` | `runs-on: fromJSON(inputs.runner)` |
| `checkout_branch` | `proj["branch"]` (pipelines.yaml) | `actions/checkout ref:` |

**Resultado:** Cada pipeline-project dispara en su propio repositorio, en su propia branch, con el runner correcto — sin IPs estáticas y sin depender del fichero `.mlops4ofp/setup.yaml` para determinar la branch.

---

## 3. Guard de duplicados por pipeline

Antes de insertar una ejecución, se bloquea si ya hay una activa para el mismo `(pipeline_id, fase, variant)`:

```python
SELECT status FROM executions
WHERE pipeline_id=? AND fase=? AND variant=?
AND status IN (queued, waiting_parent, waiting_runner, dispatching, running)
```

El frontend también hace un doble chequeo:
1. **Cola activa** — si la ejecución está en los estados anteriores, bloquea el botón.
2. **Filesystem** — `GET /api/variants/exists?phase=&variant=&pipeline_id=` comprueba si la variante ya existe y fue completada.

---

## 4. Cancel real de ejecuciones

**Problema anterior:** El botón Cancelar solo marcaba el estado en BD pero no detenía el proceso real.

**Solución** (`execution_service.py → cancel()`):

```python
async def cancel(self, execution_id: str) -> Execution:
    if ex.runner == "Local":
        kill_local(execution_id)            # SIGTERM al proceso group
    elif ex.gh_run_id and ex.status in ("running", "dispatching"):
        await cancel_run(proj["repo"], ex.gh_run_id)   # POST GitHub API /cancel
    await self._update_status(execution_id, ExecutionStatus.canceled)
```

- **Local:** `local_runner_service.py` registra el subprocess en `_ACTIVE_PROCS`; `kill()` envía `SIGTERM` al process group (`os.killpg`).
- **GitHub:** `github.py → cancel_run()` llama a `POST /repos/{repo}/actions/runs/{run_id}/cancel`.

---

## 5. Local runner por pipeline-project

**Problema anterior:** El local runner usaba un workspace global (`external/repo_local_runner/`).

**Solución:** El workspace se deriva del `pipeline_id`:

```python
# local_runner_service.py
def _workspace_path(pipeline_id: str) -> Path:
    proj = get_pipeline_project(pipeline_id)
    raw = proj.get("local_pipeline_path", "external/repo_local_runner")
    ...

def _checkout_branch(pipeline_id: str) -> str:
    proj = get_pipeline_project(pipeline_id)
    return proj.get("branch", "main")
```

Cada pipeline clona en `external/{pipeline_id}/repo_local_runner/` y hace checkout de su branch.

---

## 6. Trigger de inicialización: command_start

Para arrancar un pipeline-project nuevo existe un flujo de setup con SSE streaming:

**Ciclo 1 — Crear branch** (si no existe):
```
POST /api/pipeline-projects/{id}/create-branch  { base_branch: "main" }
→ GitHub API: POST /repos/{repo}/git/refs
```

**Ciclo 2 — Arrancar proyecto** (`command_start`):
```
POST /api/pipeline-projects/{id}/setup/start
→ project_setup_service.run_setup()
  1. git pull repo_actions
  2. git clone/pull repo_local_runner
  3. exec command_start  (leído de pipelines.yaml)
```

El comando es configurable por pipeline en `pipelines.yaml`:
```yaml
testPipelineEpoch:
  command_start: "make setup SETUP_CFG=setup/remote2.yaml"
```

El log se sirve en tiempo real vía SSE:
```
GET /api/pipeline-projects/{id}/setup/stream   → text/event-stream
```

La UI desaparece automáticamente al detectar el `init_marker` (`.mlops4ofp`) en el repo local.

---

## 7. Reconexión de ejecuciones al reiniciar el backend

Al arrancar, `execution_service.reconcile_stale()` sincroniza el estado de las ejecuciones que quedaron en vuelo:

- **running/dispatching** con `gh_run_id`: consulta el estado real en la GitHub API y actualiza BD.
- **running** sin `gh_run_id` después de 30 min: marcadas como `INTERRUPTED`.
- **waiting_parent / waiting_runner**: reactiva los tasks asyncio de dispatch.

---

## 8. Poll de GitHub en background

`_poll_gh_running()` corre cada 10 s y comprueba el estado de todos los runs activos en GitHub:

```python
SELECT gh_run_id, pipeline_id FROM executions
WHERE status='running' AND gh_run_id IS NOT NULL
```

Para cada uno llama a `GET /repos/{repo}/actions/runs/{id}` y actualiza el estado si completó. Usa `asyncio.gather` para hacer las llamadas concurrentemente.

---

---

## 9. Endpoints de trigger — referencia completa

### 9.1 Ejecuciones

#### Crear ejecución (trigger principal)
```
POST /api/executions
Content-Type: application/json

{
  "pipeline_id":     "testPipelineEpoch",
  "fase":            "f01_explore",
  "variant":         "v1_0001",
  "parent":          null,
  "params":          { "KEY": "value" },
  "selected_runner": "GithubActions"   // o "Local"
}

→ 201
{
  "id":          "uuid",
  "pipeline_id": "testPipelineEpoch",
  "fase":        "f01_explore",
  "variant":     "v1_0001",
  "parent":      null,
  "runner":      "GithubActions",
  "params":      { "KEY": "value" },
  "status":      "queued",
  "error_code":  null,
  "gh_run_id":   null,
  "created_at":  "2026-05-29T...",
  "updated_at":  "2026-05-29T..."
}

→ 409  si ya hay ejecución activa para (pipeline_id, fase, variant)
→ 400  si pipeline_id no existe en pipelines.yaml
```

#### Listar ejecuciones
```
GET /api/executions
GET /api/executions?pipeline_id=testPipelineEpoch

→ 200  [ { Execution }, ... ]
```

#### Cancelar ejecución
```
POST /api/executions/{execution_id}/cancel

→ 200  { Execution con status: "canceled" }
```
Acción real: SIGTERM al proceso local **o** `POST /runs/{id}/cancel` en GitHub API.

#### Reintentar ejecución
```
POST /api/executions/{execution_id}/retry

→ 200  { Execution con status: "queued" }
```

#### Stream SSE de cambios
```
GET /api/executions/stream

→ text/event-stream
data: { ...Execution }   // emitido en cada cambio de estado
```

#### Logs locales (SSE)
```
GET /api/executions/{execution_id}/local-logs/stream

→ text/event-stream
data: { "step": "nombre-step", "line": "texto" }
data: { "done": true }
```

#### Logs de GitHub Actions
```
GET /api/executions/gh-logs/{gh_run_id}?pipeline_id=testPipelineEpoch

→ 200  [ { "step_name": "...", "content": "..." }, ... ]
→ 404  si no hay logs o no hay token configurado
```

---

### 9.2 Cola

```
GET  /api/executions/queue/status   → { "paused": false }
POST /api/executions/queue/pause    → { "paused": true }
POST /api/executions/queue/resume   → { "paused": false }
```

---

### 9.3 Setup / inicialización de pipeline-project

#### Comprobar estado de branch
```
GET /api/pipeline-projects/{pipeline_id}/branch-status

→ 200
{
  "exists":      true,
  "branch":      "test2",
  "sha":         "abc123...",
  "initialized": true          // init_marker existe en repo local
}
```

#### Crear branch
```
POST /api/pipeline-projects/{pipeline_id}/create-branch
Content-Type: application/json

{ "base_branch": "main" }

→ 200  { "created": true, "branch": "test2", "sha": "abc123..." }
→ 400  si la base branch no existe o GitHub devuelve error
```

#### Arrancar proyecto (trigger setup)
```
POST /api/pipeline-projects/{pipeline_id}/setup/start

→ 200  { "status": "started" }
→ 200  { "status": "running", "message": "Setup ya en curso" }
```
Ejecuta en background: git pull + `command_start` (de `pipelines.yaml`).

#### Estado del setup
```
GET /api/pipeline-projects/{pipeline_id}/setup/status

→ 200
{
  "status": "idle" | "running" | "done" | "failed",
  "logs":   [ "línea 1", "línea 2", ... ]
}
```

#### Stream SSE de logs de setup
```
GET /api/pipeline-projects/{pipeline_id}/setup/stream

→ text/event-stream
data: { "line": "texto de log" }
data: { "done": true, "status": "done" | "failed" }
```

---

### 9.4 Comprobación de variante (guard frontend)

```
GET /api/variants/exists?phase=f01_explore&variant=v1_0001&pipeline_id=testPipelineEpoch

→ 200
{
  "exists":     true,
  "status":     "completed",   // o null si no existe
  "normalized": "v1_0001"
}
```

---

## Archivos clave

| Archivo | Rol |
|---|---|
| `backend/app/services/execution_service.py` | Dispatch, guard, cancel, reconcile, poll GH |
| `backend/app/services/github.py` | `dispatch_phase`, `cancel_run`, `fetch_run_status` |
| `backend/app/services/local_runner_service.py` | `run_local_phase`, `kill`, `_ACTIVE_PROCS` |
| `backend/app/services/project_setup_service.py` | Setup lifecycle con SSE |
| `backend/app/api/routers/executions.py` | Endpoints REST + SSE stream |
| `backend/app/api/routers/pipeline_projects.py` | Setup endpoints |
| `fronted/src/features/vista2/PhaseCard.jsx` | UI trigger single/multi |
| `fronted/src/features/vista2/BatchPanel.jsx` | UI trigger batch |
| `fronted/src/features/vista2/PipelineProjectSetup.jsx` | UI setup lifecycle |
