# 50 — Vista: Visualizacion y control de variantes por fase

Estado: Implementar

## Objetivo

Mostrar una tabla por fase con todas sus variantes. Cada columna representa campos extraidos de params.yaml y output.yaml segun config/table_config.yaml. La tabla debe permitir filtrar, ordenar, seleccionar columnas visibles y operar sobre estado local de artefactos DVC.

## Alcance funcional

- Descubrir fases automaticamente desde actions_repo_path_executions.
- Descubrir variantes por fase automaticamente.
- Leer params.yaml y output.yaml por variante.
- Construir filas dinamicas segun config/table_config.yaml.
- Mostrar estado local de artefactos con acciones: descargar y eliminar.
- Soportar filtros, orden, busqueda global y configuracion de columnas por fase.

## Fuente de verdad y modelo de datos

- Fuente de verdad: filesystem de external/repo_actions/executions y archivos DVC.
- Cache/indexado: SQLite local del backend para responder rapido a UI.
- Regla: SQLite es indice, no sustituye al filesystem.

## Paths de entrada

Ejemplo:

- external/repo_actions/executions/f01_explore/v1_0021/output.yaml
- external/repo_actions/executions/f01_explore/v1_0021/params.yaml

Generico:

- external/repo_actions/executions/<fase>/v*/output.yaml
- external/repo_actions/executions/<fase>/v*/params.yaml

## Regla de estado local

Se determina a partir de los archivos .dvc en la carpeta de variante:

- local = true solo si para cada *.dvc existe su archivo real correspondiente.
- local = false si falta al menos un archivo real asociado.
- local_partial = true si existe mezcla de presentes y ausentes.

Campos minimos por fila:

- local_status: one of [local, not_local, partial, error]
- local_files_present: int
- local_files_expected: int
- local_size_bytes: int

## Comandos DVC

Descarga de artefactos de variante:

```bash
source ./external/repo_actions/.venv/bin/activate
dvc pull external/repo_actions/executions/<fase>/<variant>/*.dvc
```

Borrado de artefactos locales de variante:

- Eliminar solo archivos reales asociados a .dvc.
- No borrar .dvc ni YAML.

Configuracion remota (si no esta ya aplicada):

```bash
dvc remote modify storage --local auth basic
dvc remote modify storage --local user "$DAGSHUB_USER"
dvc remote modify storage --local password "$DAGSHUB_TOKEN"
```

Variables desde .env del backend.

## Configuracion de tabla dinamica

Referencia:

- config.yaml -> table_config
- table_config actual: config/table_config.yaml

Reglas:

- phases es lista de fases.
- Cada fase define base_columns y sources.
- source_path usa notacion de puntos dentro del YAML de origen.
- type permitido: string, int, float, bool, datetime, array_string.
- label es opcional para alias de cabecera UI.
- indexed indica recomendacion de indexado en SQLite.

Ejemplo:

Ej: una fase de config/table_config.yaml
```bash
  - id: f02_events   
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parent
            source_path: parent
            type: str
            color: "#fce1fb"
          - id: Tu
            source_path: parameters.Tu
            type: int
          - id: strategy
            source_path: parameters.strategy
            type: str
          - id: bands
            source_path: parameters.bands
            type: list
          - id: nan_mode
            source_path: parameters.nan_mode
            type: str
 

      - file: output.yaml
        color: "#ffb3b3"
        columns:
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: n_events
            source_path: exports.n_events
            type: int
          - id: n_types
```


Fallback:

- Si una fase no esta en table_config, mostrar estado: "configuracion de fase no definida".
- No romper la pagina completa.

## Requisitos UX

Estados visibles por accion de Local:

- idle
- downloading
- deleting
- success
- error

Comportamiento UX:

- Mostrar spinner y texto durante download/delete.
- Deshabilitar botones de esa fila durante operacion.
- Toast de exito y error por accion.
- Modal de confirmacion obligatorio para delete.
- Mostrar tamano local en celda: por ejemplo "Local (1.2 GB)".

## Requisitos de rendimiento

- Carga lazy por fase: solo pedir datos de la fase abierta.
- Paginacion backend: limit/offset.
- Virtual scroll para tablas largas.
- Cache backend con SQLite + refresco incremental.
- Evitar parsear cientos de YAML en cada request.

## Requisitos de robustez

- Si falta params.yaml o output.yaml en una variante, fila con estado error_data.
- Si YAML esta corrupto, fila con parse_error y detalle resumido.
- Si dvc pull falla, conservar estado anterior y devolver error claro.
- Si hay lock de DVC, encolar trabajo y mostrar "queued".
- No permitir dos operaciones DVC concurrentes sobre la misma carpeta repo.

## Backend - que implementar

### 1) Descubrimiento y parseo

- Resolver ruta base desde config.yaml -> actions_repo_path_executions.
- Detectar fases y variantes automaticamente.
- Leer params.yaml y output.yaml de cada variante.
- Extraer columnas segun table_config por fase.

### 2) Indexado SQLite

Tabla sugerida:

```sql
CREATE TABLE IF NOT EXISTS execution_variants (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  variant TEXT NOT NULL,
  local_status TEXT NOT NULL,
  local_files_present INTEGER NOT NULL DEFAULT 0,
  local_files_expected INTEGER NOT NULL DEFAULT 0,
  local_size_bytes INTEGER NOT NULL DEFAULT 0,
  params_json TEXT,
  output_json TEXT,
  parse_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_variants_phase ON execution_variants (phase);
CREATE INDEX IF NOT EXISTS idx_execution_variants_variant ON execution_variants (variant);
```

### 3) Sincronizacion

- Sync inicial al arrancar backend.
- Sync incremental cuando termina download/delete.
- Endpoint de sync manual.
- Opcional: watcher de filesystem para sync en background.

### 4) Cola de operaciones DVC

- Cola serial global para el repo (1 worker).
- Estados de job: queued, running, done, failed.
- Endpoint para consultar estado de job.

### 5) API minima

- GET /api/variants/phases
- GET /api/variants/table-config/:phase
- GET /api/variants/rows?phase=&limit=&offset=&q=&sort_by=&sort_dir=
- POST /api/variants/local/pull
- POST /api/variants/local/delete
- POST /api/variants/sync
- GET /api/variants/jobs/:job_id

Payload recomendado pull/delete:

```json
{
  "phase": "f02_events",
  "variant": "v1_0021"
}
```

## Frontend - que implementar

- Tabla con filtros por columna y orden asc/desc.
- Busqueda global por fase activa.
- Selector de columnas visibles con checklist por fase.
- Boton reset para restaurar todas las columnas visibles.
- Persistencia de columnas por fase en localStorage.
- Sticky header y sticky columna variant.
- Lazy loading por fase desplegada.
- Virtual scroll para listas largas.
- Columna Local con acciones descargar/eliminar.
- Estado visual de jobs queued/running/success/error.
- Modal de confirmacion para delete.
- Toasts de feedback.

## Interaccion esperada

```text
Usuario abre fase -> UI pide rows fase activa -> backend responde desde SQLite.
Usuario pulsa descargar -> backend crea job queued -> worker ejecuta dvc pull.
Al terminar -> backend actualiza SQLite -> UI refresca fila y muestra toast.
```

## Estructura visual objetivo

```text
+---------------------------------------------------------------+
| f01_explore, f02_events, ...                     [Columnas v] |
+---------------------------------------------------------------+
| Tabla de variantes                                            |
| Variant | ... columnas dinamicas ... | Local                  |
| v1_0001 | ...                        | local (1.2 GB) [X]     |
| v1_0002 | ...                        | no local [Descargar]    |
+---------------------------------------------------------------+
```

## Criterios de aceptacion

- La UI no se bloquea con 500 variantes en una fase.
- Filtro y orden funcionan sobre columnas configuradas.
- Download y delete muestran progreso y resultado.
- No hay dos jobs DVC simultaneos sobre el mismo repo.
- Si falta un YAML, la fila aparece con error sin romper la tabla.
- Si fase no existe en table_config, se ve mensaje controlado.
- Configuracion de columnas se conserva al recargar.

## Fuera de alcance en esta iteracion

- Comparador avanzado multi-variante con diff visual completo.
- Exportacion Excel.
- Reglas automaticas de highlight de mejores metricas.

## Notas

- Mantener nombres estables de columnas con id interno; usar label solo para UI.
- Mantener compatibilidad futura para columnas compuestas.



