# 20 — Vista: Linaje de Pipeline (pipeline_lineage.html)

Estado: Implementar

## Objetivo

Mostrar el archivo `executions/pipeline_lineage.html` generado por el repositorio de GitHub Actions configurado en `config.yaml`. El HTML se regenera con cada nuevo commit en la branch configurada.

---

## Config relevante (`config.yaml`)

```yaml
github_actions_repository: "Tehedor/MLOps_actions_v2"
actions_branch: "test"
```

Estos valores se leen dinámicamente; no hardcodear.

---

## Librería principal

**ghapi** — wrapper oficial de la GitHub REST API para Python.
- Docs: https://ghapi.fast.ai/ (NotebookLM: "Docs ghapi MLOps")
- Referencia REST: https://docs.github.com/en/rest/actions (NotebookLM: "Docs ghapi MLOps")
- Token: `GITHUB_TOKEN` del `.env`

---

## Flujo de datos

```
config.yaml
    └── github_actions_repository + actions_branch
            └── [ghapi] GET /repos/{owner}/{repo}/commits?sha={branch}&per_page=1
                    └── sha del último commit
                            └── comparar con sha almacenado en BD/memoria
                                    ├── mismo sha → no hacer nada
                                    └── nuevo sha → cd repo clonado && make generate_lineage
                                                        └── lee executions/pipeline_lineage.html
                                                                └── sirve via endpoint /lineage/html
```

---

## Backend — qué implementar

### Nuevos archivos
- `backend/app/services/lineage_service.py` — lógica de polling y generación
- `backend/app/api/routers/lineage.py` — endpoints REST

### `lineage_service.py`

```python
# Responsabilidades:
# 1. Leer owner/repo/branch de config.yaml
# 2. Con ghapi: obtener sha del último commit de la branch
# 3. Comparar con sha previo (variable en memoria o tabla SQLite)
# 4. Si hay nuevo commit: subprocess("make generate_lineage") dentro del repo clonado
# 5. Leer y devolver el contenido de executions/pipeline_lineage.html

from ghapi.all import GhApi
import os, subprocess
from pathlib import Path

api = GhApi(token=os.environ["GITHUB_TOKEN"])

def get_latest_commit_sha(owner: str, repo: str, branch: str) -> str:
    commits = api.repos.list_commits(owner=owner, repo=repo, sha=branch, per_page=1)
    return commits[0].sha

def run_generate_lineage(repo_local_path: str):
    subprocess.run(["make", "generate_lineage"], cwd=repo_local_path, check=True)

def read_lineage_html(repo_local_path: str) -> str:
    html_path = Path(repo_local_path) / "executions" / "pipeline_lineage.html"
    return html_path.read_text()
```

### Endpoints (`lineage.py`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/lineage/status` | Devuelve sha actual, timestamp última generación, estado |
| `GET` | `/lineage/html` | Devuelve el HTML del linaje como texto |
| `POST` | `/lineage/refresh` | Fuerza comprobación de nuevo commit y regeneración |

### Polling automático
- Task background con `asyncio` que comprueba nuevo commit cada N segundos (configurable, default 60s).
- Al arrancar el backend: hacer una comprobación inicial.

---

## Frontend — qué implementar

### Nuevos archivos
- `fronted/src/features/lineage/LineageView.jsx` — página principal
- `fronted/src/api/lineage.js` — llamadas a `/lineage/*`

### `LineageView.jsx`

Estructura:
```
┌─────────────────────────────────────────────────────┐
│  Header: "Pipeline Lineage"   [Refresh] [sha: abc123] │
│  Subtitle: repo/branch · último update: hace 5 min   │
├─────────────────────────────────────────────────────┤
│                                                       │
│   <iframe> o dangerouslySetInnerHTML                  │
│   con el HTML de pipeline_lineage.html                │
│   (ocupa todo el espacio disponible)                  │
│                                                       │
└─────────────────────────────────────────────────────┘
```

- Usar TanStack Query con `refetchInterval: 60_000` para polling automático desde el front.
- El botón Refresh llama a `POST /lineage/refresh` y luego invalida la query.
- Mostrar estado de carga y error con los componentes UI existentes.

### `lineage.js`

```js
// getLineageStatus() → GET /lineage/status
// getLineageHtml()   → GET /lineage/html
// refreshLineage()   → POST /lineage/refresh
```

---

## Registro en App

- Añadir ruta `/lineage` en `App.jsx`.
- Añadir enlace en navegación del Shell.
- Registrar router en `backend/app/main.py`: `app.include_router(lineage.router)`.

---

## Dependencias

- `ghapi` — añadir a `backend/requirements.txt`
- `GITHUB_TOKEN` — ya debe estar en `.env` (ver `.env.example`)
- Repo `Tehedor/MLOps_actions_v2` debe estar clonado localmente; ruta configurable (añadir `actions_repo_local_path` a `config.yaml` si no existe).

---

## Referencias cruzadas

- Stack general: [01_Stack.md](01_Stack.md)
- Estructura de carpetas: [02_Proyect_Structure.md](02_Proyect_Structure.md)
- Config dinámica: [config.yaml](../config.yaml)
