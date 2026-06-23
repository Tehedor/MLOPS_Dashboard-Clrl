# Skill: Generador de Lotes de Ejecución (v2)

Convierte comandos Makefile, bloques YAML o descripciones informales en lotes JSON
listos para pegar en la vista de ejecuciones del dashboard.

El skill es completamente genérico: los params de cada fase se derivan del
`traceability_schema.yaml` del pipeline indicado, y los runners del `fase_runners.yaml`.
No hay mapeos hardcodeados aquí.

---

## Componentes del dataset

Las 17 medidas (columnas) disponibles en el CSV de datos. Cada una genera eventos
en f02 con su nombre como prefijo 

Total componentes: 17
Rango temporal disponible (leyendo primera y última línea)...

   1. Battery_Active_Power
   2. Battery_Active_Power_Set_Response
   3. PVPCS_Active_Power
   4. GE_Body_Active_Power
   5. GE_Active_Power
   6. GE_Body_Active_Power_Set_Response
   7. FC_Active_Power_FC_END_Set
   8. FC_Active_Power
   9. FC_Active_Power_FC_end_Set_Response
  10. Island_mode_MCCB_Active_Power
  11. MG-LV-MSB_AC_Voltage
  12. Receiving_Point_AC_Voltage
  13. Island_mode_MCCB_AC_Voltage
  14. Island_mode_MCCB_Frequency
  15. MG-LV-MSB_Frequency
  16. Inlet_Temperature_of_Chilled_Water
  17. Outlet_Temperature

---

## Paso 0 — Identificar el pipeline

El usuario **debe** nombrar el pipeline (ej. "MLOps4RTEdge-I", "mlops4rtedgeTSI").
Resolver el slug en `config/pipelines.yaml` bajo la clave `pipelines`.
Confirmar al usuario qué pipeline se ha seleccionado con su `label` y `repo`.

Si el usuario da un label impreciso, buscar por coincidencia parcial en `label` o `id`.

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

## Paso 1.5 — Corrección automática de nombres de parámetros

Cuando el input del usuario usa nombres de parámetros distintos a los del schema,
corregirlos **automáticamente** y avisar al usuario de cada corrección.

### Tabla de alias conocidos

| Input del usuario      | Nombre en schema (varía por pipeline)  |
|------------------------|----------------------------------------|
| `event_strategy`       | `strategy` (mlops4rtedge, mlops4rtedgeUni) |
| `measure`              | `measure_name` (mlops4rtedgeTS, mlops4rtedgeUni) |
| `name` (en f04)        | `prediction_name`                      |
| `operator` (en f04)    | `target_operator`                      |
| `events` (en f04)      | `target_event_types`                   |

### Regla general

Para cualquier param del input que NO exista en el schema de la fase:
1. Buscar coincidencia exacta case-insensitive (sin `_`).
2. Si no hay match exacto, buscar por substring (`name` → `prediction_name`).
3. Si se encuentra, renombrar y mostrar:
   ```
   ℹ️ Corregido: "event_strategy" → "strategy" (f02_events)
   ```
4. Si NO se encuentra ningún candidato → marcar como error:
   ```
   ⚠️ Param desconocido: "foo" en f02_events — no existe en el schema
   ```

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

### Formato B — YAML completo (lote de Inés)

Formato donde el usuario pega un YAML con todas las fases y variantes:
```yaml
pipeline: events
repo_path: C:/Users/inesv/Desktop/STRAST/mlops4rtedge
selected_runner: GithubActions
variants:
  f01:
  - phase: f01_explore
    variant: v1_0000
    parent: null
    parameters:
      raw_path: data/raw.csv
      ...
  f02:
  - variant: v2_0001
    params:
      strategy: transitions
      bands: [10, 20, 30, 40, 50, 60, 70, 80, 90]
      nan_mode: discard
    parent: v1_0000
    selected_runner: GithubActions
```

**Reglas de parseo**:
- Aceptar tanto `params` como `parameters` como clave de parámetros.
- Ignorar `pipeline`, `repo_path`, `jobs` (metadatos del generador externo).
- Cada entrada bajo `variants.f0N` es una variante de la fase N.
- Aplicar la corrección de nombres del Paso 1.5 a cada variante.

### Formato C — YAML por fase
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

### Formato D — Lenguaje natural
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

## Paso 4 — Validación de `target_event_types` en f04 contra catálogo real

**Este paso es OBLIGATORIO** para toda variante f04 que incluya `target_event_types`.

### 4a. Trazar la cadena de parentesco

Para cada variante f04:
1. Su `parent` es una variante f03 (ej. `v3_0001`).
2. Buscar esa variante f03 en el input → su `parent` es una variante f02 (ej. `v2_0001`).
3. Anotar las `bands` de esa variante f02 (ej. `[10, 20, 30, ..., 90]`).

### 4b. Localizar el catálogo de eventos

El catálogo real se busca en el directorio de ejecuciones de la pipeline seleccionada:
```
external/{pipeline_id}/repo_actions/executions/f02_events/{v2_XXXX}/02_events_catalog.json
```
donde `{pipeline_id}` es el slug de la pipeline en `pipelines.yaml` (ej. `mlops4rtedgeI`)
y `{v2_XXXX}` es la variante f02 ancestro.

**Si el fichero existe** → leerlo. Las claves del dict son los nombres de evento válidos.
**Si NO existe** → la variante f02 aún no se ha ejecutado. Avisar al usuario:
```
ℹ️ Catálogo no disponible para v2_XXXX (aún no ejecutada). Validación basada solo en lista generada.
```

### 4c. Generar la lista esperada de eventos

A partir de la cadena trazada, generar los eventos que DEBERÍAN existir.
Para una medida `M`, dirección `high`, umbral `T`, y bands `[B1, B2, ..., BN]`:

**Regla de generación de nombres de evento (strategy=transitions)**:

Las bandas definen intervalos: `[0, B1]`, `[B1, B2]`, ..., `[BN, 100]`.
- `high` con umbral `T` → eventos cuyo destino incluye el rango del umbral.
  Formato: `{M}_{FROM_LO}_{FROM_HI}-to-{TO_LO}_{TO_HI}`
  donde `TO_LO >= T` (el rango destino está por encima del umbral).
  Ejemplo con bands [10,20,...,90], M=GE_Active_Power, high, T=90:
  → todos los `GE_Active_Power_X_Y-to-90_100` donde X_Y son bandas por debajo de 90.

- `low` con umbral `T` → eventos cuyo destino está por debajo del umbral.
  → todos los `{M}_X_Y-to-0_{T}` donde X_Y son bandas por encima de T.

**Importante**: solo generar los patrones base (sin `_Set_Response_`).
Los eventos `_Set_Response_` pueden o no existir en el catálogo según la medida.

### 4d. Contraste de tres vías: usuario × generado × catálogo

Se manejan tres conjuntos de eventos para cada variante f04:

- **U** = lista que puso el usuario en `target_event_types`
- **G** = lista generada por el skill (paso 4c) a partir de medida + dirección + umbral + bands
- **C** = claves del catálogo JSON real (si existe; si no, se omite esta fuente)

Producir el informe comparando las tres fuentes:

| Situación | Símbolo | Significado |
|-----------|---------|-------------|
| En U, en C, en G | ✓ | Evento correcto y esperado |
| En U, en C, NO en G | ℹ️ | Usuario añadió evento extra válido (existe en catálogo pero no era esperado por la lógica de bandas) |
| En U, NO en C, en G | ⚠️ | **ANOMALÍA** — la lógica dice que debería existir pero el catálogo no lo tiene (posible bug en f02 o en la generación de eventos) |
| En U, NO en C, NO en G | ❌ | **ERROR** — evento inventado, no existe ni debería. Hará fallar f04 |
| NO en U, en C, en G | ℹ️ | Evento disponible que el usuario no incluyó (informativo) |
| NO en U, en C, NO en G | — | Evento de otra medida/dirección, irrelevante |
| NO en U, NO en C, en G | — | Generado pero no existe en catálogo (la lógica de generación predice más de lo que f02 creó) |

**Regla**: si hay ❌ o ⚠️ → mostrar anomalías y pedir confirmación antes de generar.
Si solo hay ✓ y ℹ️ → proceder sin preguntar.

Si el catálogo no existe (variante f02 no ejecutada), el contraste se reduce a U vs G:
- En U, en G → ✓ (probablemente correcto)
- En U, NO en G → ℹ️ (extra, sin catálogo no se puede confirmar)
- NO en U, en G → ℹ️ (faltante según lógica, sin catálogo no se puede confirmar)

### 4e. Formato del informe de anomalías

Mostrar ANTES de generar el .txt:

```
━━━ Validación f04 contra catálogo ━━━

v4_0006 (parent: v3_0002 → v2_0002, catálogo: 340 eventos)
  ⚠️ 4 eventos NO existen en catálogo:
    - Outlet_Temperature_Set_Response_0_20-to-80_100
    - Outlet_Temperature_Set_Response_20_40-to-80_100
    - Outlet_Temperature_Set_Response_40_60-to-80_100
    - Outlet_Temperature_Set_Response_60_80-to-80_100
  ✓ 4 eventos OK:
    - Outlet_Temperature_0_20-to-80_100
    - Outlet_Temperature_20_40-to-80_100
    - Outlet_Temperature_40_60-to-80_100
    - Outlet_Temperature_60_80-to-80_100

v4_0001 (parent: v3_0001 → v2_0001, catálogo: 1530 eventos)
  ✓ 18 eventos, todos en catálogo
```

Si hay anomalías:
```
⚠️ Se detectaron anomalías en X variantes de f04.
¿Quieres que elimine los eventos inválidos y genere el lote corregido,
o prefieres revisar manualmente primero?
```

**No generar el .txt final hasta que el usuario confirme** qué hacer con las anomalías.

---

## Paso 5 — Detección de colisiones (opcional)

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

**Input** (pipeline: `mlops4rtedgeI`, formato YAML de Inés):
```yaml
pipeline: events
repo_path: C:/Users/inesv/Desktop/STRAST/mlops4rtedge
variants:
  f02:
  - variant: v2_0001
    params:
      event_strategy: transitions    # ← nombre incorrecto
      bands: [10, 20, 30, 40, 50, 60, 70, 80, 90]
      nan_mode: discard
    parent: v1_0000
  f04:
  - variant: v4_0006
    params:
      name: outlet_temperature_high_80_fine_4    # ← nombre incorrecto
      operator: OR                                # ← nombre incorrecto
      events:                                     # ← nombre incorrecto
      - Outlet_Temperature_0_20-to-80_100
      - Outlet_Temperature_Set_Response_0_20-to-80_100  # ← no existe en catálogo
      ...
    parent: v3_0002
```

**Proceso**:
1. Pipeline: `mlops4rtedgeI` → schema en `external/mlops4rtedge/...`
2. Correcciones automáticas:
   ```
   ℹ️ f02: "event_strategy" → "strategy"
   ℹ️ f04: "name" → "prediction_name"
   ℹ️ f04: "operator" → "target_operator"
   ℹ️ f04: "events" → "target_event_types"
   ```
3. Validación f04 contra catálogo `v2_0002/02_events_catalog.json`:
   ```
   ⚠️ v4_0006: 4 eventos no existen en catálogo (todos son _Set_Response_)
   ```
4. Usuario confirma → se eliminan los eventos inválidos → se genera el .txt

> Si el schema de otro pipeline (mlops4rtedgeTS, mlops4rtedgeUni) tiene parámetros
> distintos, el output cambia en consecuencia — eso es el comportamiento correcto.
