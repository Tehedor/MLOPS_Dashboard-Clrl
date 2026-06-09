# Skill: Generador de Lotes de Ejecución

Convierte comandos Makefile, bloques YAML o descripciones informales en lotes JSON
listos para pegar en la vista de ejecuciones del dashboard.

El skill es completamente genérico: los params de cada fase se derivan del
`traceability_schema.yaml` del pipeline indicado, y los runners del `fase_runners.yaml`.
No hay mapeos hardcodeados aquí.

---

## Paso 0 — Identificar el pipeline

El usuario indica el pipeline (o se infiere del contexto).
Los slugs disponibles están en `config/pipelines.yaml` bajo la clave `pipelines`.

---

## Paso 1 — Leer los ficheros de configuración

### 1a. Localizar el traceability schema

En `config/pipelines.yaml`, buscar la entrada del pipeline y leer su `traceability_path`:

```yaml
mlops4rtedge:
  traceability_path: "external/mlops4rtedge/repo_actions/scripts/traceability_schema.yaml"
```

Leer ese fichero. Es la fuente de verdad para los parámetros de cada fase.

### 1b. Estructura del traceability schema

```yaml
phases:
  f01_explore:
    parent_required: false
    parameters:
      raw_path:
        type: string
        required: true
        inherited: false
      cleaning:
        type: string
        required: true
        allowed: [none, basic, strict]
      nan_values:
        type: list
        required: false
      ...
  f02_events:
    parent_required: true
    parameters:
      parent_variant:       # ← campo especial, ver regla abajo
        type: string
        required: true
      strategy:
        type: string
        required: true
      ...
```

**Reglas de extracción**:

1. Cada clave bajo `phases.{fase}.parameters` es un campo del lote, **excepto**
   `parent_variant` (o cualquier clave con `check` de regex de variante padre) que se
   convierte en el campo top-level `"parent"`.

2. Los campos con `inherited: true` **solo se incluyen en `params` si el usuario los
   proporciona explícitamente**. Si no los da, se omiten del JSON
   (el backend los hereda de la fase padre).

3. Defaults según `type` cuando el campo es `required: false` y el usuario no lo da:
   - `string` → `null`
   - `integer` / `float` / `number` → `null`
   - `list` → `[]`
   - `dict` → `{}`
   - `boolean` → `null`

4. Si el campo tiene `allowed:`, el valor del usuario debe ser uno de esos. Si no lo
   proporciona y es `required: true`, dejar `null` y añadir un comentario `# REQUIRED`.

### 1c. Runners → `config/{slug}/fase_runners.yaml`

```yaml
fases:
  - fase: f01_explore
    runner: "GithubActions, K8s-8gb, Local"
    parent_required: false
```

**Regla**: `selected_runner` = primer token del campo `runner` (split por `,`, strip de espacios).

---

## Paso 2 — Parsear el input del usuario

Se aceptan tres formatos. Pueden mezclarse en el mismo mensaje.

### Formato A — Makefile
```bash
make variant3 VARIANT=v302 PARENT=v202 OW=600 LT=100 PW=100 STRATEGY=synchro NAN_MODE=discard
```
- `VARIANT=` → campo `"variant"` (top-level)
- `PARENT=` / `PARENTS=` → campo `"parent"` (top-level)

**Convención de nombres de variante**: el formato obligatorio es `v[N]_[XXXX]` donde `N`
es el número de fase (1–8) y `XXXX` es el ID de 4 dígitos con ceros a la izquierda.
Si el usuario da una forma corta como `vNXX` (p.ej. `v202`), normalizar a `v[N]_[XXXX]`
(→ `v2_0002`). Regla de normalización:
- primer dígito después de `v` = número de fase → N
- dígitos restantes = ID numérico → zero-pad a 4 → XXXX
Ejemplos: `v001`→`v1_0001`, `v202`→`v2_0002`, `v302`→`v3_0002`, `v401`→`v4_0001`.
El padre de la fase N **siempre** debe ser `v[N-1]_XXXX` (validado por el schema).
- El resto de variables → buscar el campo del schema con nombre más cercano
  (case-insensitive, ignorar `_` al comparar; ej: `NAN_MODE`→`nan_mode`, `MODEL_FAMILY`→`model_family`)
- Valores tipo `'[10, 90]'` → parsear como array JSON real
- `EVENTS='["ev1,ev2"]'` con coma dentro del string → split por `,` → `["ev1","ev2"]`

### Formato B — YAML
```yaml
phase: f03_windows
variant: v302
parent: v202
params:
  OW: 600
  LT: 100
  window_strategy: synchro
  nan_mode: discard
```
O lista de fases:
```yaml
- phase: f01_explore
  variant: v001
  params:
    raw_path: data/raw.csv
    cleaning: basic

- phase: f02_events
  variant: v202
  parent: v001
  params:
    strategy: transitions
    bands: [10, 90]
```

### Formato C — Lenguaje natural
> "F03 con ventana 600, LT 100, PW 100, estrategia synchro, padre v202"

Claude deduce la fase, busca los campos en el schema, y mapea los términos al nombre
exacto del parámetro.

---

## Paso 3 — Construir cada lote JSON

Para cada fase:

1. Runner → primer token de `fase_runners.yaml[fase].runner`.
2. Determinar si necesita `"parent"` → `parent_required` en el schema.
3. Para cada parámetro del schema (excepto `parent_variant`):
   - Si es `inherited: true` y el usuario no lo dio → **omitir**.
   - Si el usuario lo dio → incluir con su valor parseado.
   - Si `required: true` y no lo dio → incluir con `null` + comentario `# REQUIRED`.
   - Si `required: false` y no lo dio → incluir con default según `type`.
4. Para parámetros con estructura anidada (e.g. `automl.enabled`) → reconstruir el objeto.

### Estructura de salida
```
#f0N_nombre_fase

{
  "variant": "...",
  "params": {
    // solo los campos definidos en phases.{fase}.parameters del traceability schema
    // (sin parent_variant, sin campos inherited no dados por el usuario)
  },
  "parent": "...",          // solo si parent_required: true
  "selected_runner": "..."  // primer runner del fase_runners.yaml
}
```

Todos los bloques en un único bloque de código Markdown para copiar de una vez.

---

## Paso 4 — Detección de colisiones (opcional)

Si el usuario adjunta la lista de variantes existentes (JSON array, YAML list, o texto
separado por comas):

- Si el `variant` generado ya existe → añadir encima del bloque:
  ```
  # ⚠️ ya existe, recomiendo v{N}_{MMMM}
  ```
  donde `{MMMM}` = max ID existente en ese namespace de fase + 1, con padding a 4 dígitos.
- El JSON mantiene el variant original; la línea `# ⚠️` es solo aviso.

---

## Ejemplo

**Input** (pipeline: `mlops4rtedge`, Makefile):
```bash
make variant1 VARIANT=v001 RAW=./data/raw.csv CLEANING=basic NAN_VALUES='[-999999]'
make variant2 VARIANT=v202 PARENT=v001 STRATEGY=transitions BANDS='[10, 90]' NAN_MODE=discard
make variant5 VARIANT=v502 PARENT=v401 MODEL_FAMILY=cnn1d IMBALANCE_STRATEGY=rare_events
```

**Proceso**:
1. `traceability_path` de `mlops4rtedge` en `pipelines.yaml` →
   `external/mlops4rtedge/repo_actions/scripts/traceability_schema.yaml`
2. Leer schema: f01 tiene `raw_path`, `cleaning`, `nan_values`, `error_values`,
   `first_line`, `max_lines`. f02 tiene `parent_variant`, `Tu` (inherited), `strategy`,
   `bands`, `nan_mode`. Etc.
3. Leer `config/mlops4rtedge/fase_runners.yaml` → f01–f06=`GithubActions`, f07–f08=`ESP32-self-hosted`.
4. Mapear: `RAW`→`raw_path`, `NAN_VALUES`→`nan_values`, `STRATEGY`→`strategy`, `BANDS`→`bands`,
   `MODEL_FAMILY`→`model_family`, `IMBALANCE_STRATEGY`→`imbalance_strategy`.
5. `Tu` en f02 es `inherited: true` y el usuario no lo da → omitir.

**Output**:
```json
#f01_explore

{
  "variant": "v001",
  "params": {
    "raw_path": "data/raw.csv",
    "cleaning": "basic",
    "nan_values": [-999999],
    "error_values": {},
    "first_line": null,
    "max_lines": null
  },
  "selected_runner": "GithubActions"
}


#f02_events

{
  "variant": "v202",
  "params": {
    "strategy": "transitions",
    "bands": [10, 90],
    "nan_mode": "discard"
  },
  "parent": "v001",
  "selected_runner": "GithubActions"
}


#f05_modeling

{
  "variant": "v502",
  "params": {
    "model_family": "cnn1d",
    "imbalance_strategy": "rare_events"
    // campos inherited (Tu, OW, LT, PW, prediction_name, event_type_count) omitidos
    // campos no dados con required:false → omitidos o null según schema
  },
  "parent": "v401",
  "selected_runner": "GithubActions"
}
```

> Si el schema de otro pipeline (mlops4rtedgeTS, mlops4rtedgeUni) tiene parámetros
> distintos, el output cambia en consecuencia — eso es el comportamiento correcto.
