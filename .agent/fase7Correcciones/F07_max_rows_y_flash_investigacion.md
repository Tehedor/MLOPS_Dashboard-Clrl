# F07 — Investigación: max_rows, tamaño de binario y límites de flash

Fecha: 2026-06-12  
Contexto: comparación pipeline viejo (`MLOps_actions_v22`) vs nuevo (`mlops4rtedge_vm2`)

---

## 1. Pregunta original

¿Por qué el nuevo repo requiere `max_rows` en f07 cuando el viejo funcionaba sin él?

---

## 2. Hallazgo principal: el dataset se compila dentro del binario

`f071_preparebuild.py` llama a `generate_memory_events_header()` que convierte el dataset de calibración (`.parquet` → CSV → arrays C) en `build_generated/memory_events.h`. Este fichero se **compila dentro del firmware ESP32**. Cada fila del CSV se convierte en:

```c
static const event_t memory_event_42[] = { 11, 8, 11, 8, 16, 18 };
```

Esto significa que **a más filas en el dataset → binario más grande → puede no caber en la partición flash**.

El `max_rows` en f071 controla cuántas filas entran en `memory_events.h`, **no** cuántas se envían por serial. El `max_rows` que se pasa a `copy_dataset_to_csv` también trunca el CSV para serial, pero el cuello de botella real es el tamaño del binario.

---

## 3. Comparativa de pipelines completa (f07 → f01)

### Pipeline viejo — v7_0018 (MLOps_actions_v22)

| Fase | Variant | Parámetro clave | Valor |
|------|---------|-----------------|-------|
| f01 | v1_0009 | MAX_LINES | **null** (dataset completo) |
| f01 | v1_0009 | n_rows | **3.887.242** |
| f02 | v2_0009 | BANDS / STRATEGY | [10,90] / transitions |
| f02 | v2_0009 | n_events | 3.887.242 |
| f03 | v3_0009 | OW | 600 |
| f03 | v3_0009 | n_windows | **1.150.178** |
| f06 | v6_0013 | n_calibration_samples | **22.346** |
| f06 | v6_0013 | input_bytes | **51** |
| f06 | v6_0013 | event_type_count | 102 |
| f07 | v7_0018 | max_rows | null |
| f07 | v7_0018 | **avg eventos/fila** | **~9** |
| f07 | v7_0018 | **binario resultante** | **776 KB ✓** |

### Pipeline nuevo — v7_0056 (mlops4rtedge_vm2)

| Fase | Variant | Parámetro clave | Valor |
|------|---------|-----------------|-------|
| f01 | v1_0019 | MAX_LINES | **43.200** (truncado para dev) |
| f01 | v1_0019 | n_rows | **43.200** |
| f02 | v2_0019 | BANDS / STRATEGY | [10,90] / transitions |
| f02 | v2_0019 | n_events | 43.200 |
| f03 | v3_0019 | OW | 600 |
| f03 | v3_0019 | n_windows | **37.639** |
| f06 | v6_0019 | n_calibration_samples | **34.984** |
| f06 | v6_0019 | input_bytes | **186** |
| f06 | v6_0019 | event_type_count | 60 |
| f07 | v7_0056 | max_rows | null (sin truncar → revienta) |
| f07 | v7_0056 | **avg eventos/fila** | **~46** |
| f07 | v7_0056 | **binario sin max_rows** | **2.2 MB ✗** |

---

## 4. Por qué el viejo cabía y el nuevo no

La diferencia crítica no es el número de filas, sino la **densidad de eventos por ventana**:

| | Viejo | Nuevo |
|--|-------|-------|
| Filas calibración | 22.346 | 34.984 |
| Avg eventos/fila | **~9** | **~46** |
| Bytes de datos compilados | ~201 KB | ~1.750 KB |
| Overhead fijo (código + modelo) | ~492 KB | ~492 KB |
| **Total binario** | **~776 KB** | **~2.200 KB** |
| Partición factory | 1 MB | 1 MB |
| Resultado | **Cabe (24% libre)** | **Overflow 1.2 MB** |

El viejo tenía ventanas dispersas (~9 eventos por OW de 600 pasos) porque el dataset raw de 3.8M filas tenía transiciones de banda infrecuentes. El nuevo tiene el dataset truncado a 43.200 filas con transiciones más densas (~46 eventos/OW).

---

## 5. Relación entre f01 truncado y el problema de f07

El `MAX_LINES=43.200` en f01 del nuevo repo es un **shortcut de desarrollo**, no el dataset de producción. Sus efectos en cadena:

1. f01: solo 43.200 filas raw
2. f03: solo 37.639 windows totales
3. f06: usa 34.984 como calibración (93% de todos los windows — proporción anómala)
4. f07: esos 34.984 × 46 eventos/fila → binario de 2.2 MB → no cabe

En el pipeline de **producción** (dataset completo), f06 seleccionaría un subconjunto representativo del orden de 20-50k windows de millones disponibles, con la misma densidad de eventos que el viejo (~9/fila si los datos son similares).

---

## 6. Límite real de filas según configuración de flash

Overhead fijo del binario (código ESP32 + modelo TFLite + ROM tables): **~492 KB**

Con densidad del nuevo dataset (~46 eventos/fila × 1 byte/evento + 4 bytes puntero = ~50 bytes/fila):

| Configuración partición | Tamaño factory | **Máx filas** |
|------------------------|---------------|---------------|
| `SINGLE_APP` (actual) | 1 MB | **~10.000** |
| `SINGLE_APP_LARGE` | 1.5 MB | **~21.000** |
| Custom 3MB (flash 4MB) | 3 MB | **~52.000** |

Con densidad del viejo (~9 eventos/fila = ~13 bytes/fila):

| Configuración partición | **Máx filas** |
|------------------------|---------------|
| `SINGLE_APP` (1 MB) | **~42.000** |
| `SINGLE_APP_LARGE` (1.5 MB) | **~80.000** |

**Conclusión**: el límite de filas depende directamente de la densidad de eventos del dataset. Con datos de producción similares al viejo, la partición actual de 1 MB aguanta ~42k filas.

---

## 7. Distribución de etiquetas en el dataset actual

Dataset de calibración del nuevo repo (v6_0019, 34.984 filas):

| Label | Count | % |
|-------|-------|---|
| 0 (no evento) | 29.710 | 84.9% |
| 1 (battery_overheat) | 5.274 | 15.1% |

La distribución es **uniforme a lo largo del archivo** (~14-16% positivos por cada bloque de 1.000 filas). Cualquier prefijo de N filas es estadísticamente representativo.

Implicación para `max_rows`:
- 1.000 filas → ~150 positivos (test de humo)
- 3.000 filas → ~450 positivos (dev rápido, métricas útiles)
- **5.000 filas → ~750 positivos (dev estándar, robusto estadísticamente)**
- 10.000 filas → ~1.500 positivos (pre-release)

---

## 8. Modos de operación del firmware y `memory_events.h`

El firmware ESP32 tiene dos modos:

| Modo | Fuente de datos | Cuándo usarlo |
|------|----------------|---------------|
| **memory** | `memory_events.h` compilado en el binario | Demo offline, sin PC conectado |
| **serial** | PC envía filas por UART en f072 | Validación real en f07 |

`generate_memory_events_header()` siempre genera el header con `max_rows` filas del dataset. El problema: incluso usando modo serial, el header **siempre se compila** y ocupa espacio en flash.

---

## 9. Opciones de solución

### Opción A — Cambiar a `SINGLE_APP_LARGE` (fix rápido, 1 línea)

En `edge/esp32/template_project/sdkconfig`:
```
# CONFIG_PARTITION_TABLE_SINGLE_APP is not set
CONFIG_PARTITION_TABLE_SINGLE_APP_LARGE=y
```

- Sube factory a 1.5 MB
- Caben ~21.000 filas con dataset denso actual
- Cubre el pipeline de dev y el viejo de producción
- No requiere cambios de código

**Límite**: si el dataset de producción tiene >21k filas densas, vuelve a fallar.

### Opción B — Flash 4MB + partición custom

En `sdkconfig`: `CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y`  
Crear `partitions.csv` con factory de 3 MB:

```csv
# Name,   Type, SubType, Offset,   Size,  Flags
nvs,      data, nvs,     0x9000,   0x6000,
phy_init, data, phy,     0xf000,   0x1000,
factory,  app,  factory, 0x10000,  0x2F0000,
```

- Caben ~52.000 filas con dataset denso
- Requiere hardware con flash 4MB (la mayoría de ESP32-WROOM tienen 4MB)

### Opción C — Separar dataset embebido de dataset de validación (correcto a largo plazo)

`memory_events.h` siempre genera un placeholder mínimo (50-100 filas) para modo memory/demo. La validación completa siempre usa serial.

Cambio en `f071_preparebuild.py`:
```python
# Para el header embebido (modo memory offline): máximo 100 filas
MEMORY_MODE_MAX_ROWS = 100
generate_memory_events_header(
    csv_variant,
    memory_events_path,
    event_type_count=event_type_count,
    max_rows=MEMORY_MODE_MAX_ROWS,   # fijo, no el max_rows de f07
)

# Para serial: max_rows de f07 controla el timing de la validación
copy_dataset_to_csv(..., max_rows=max_rows)
```

Beneficios:
- Binario siempre pequeño (~600 KB independientemente del dataset)
- `max_rows` en f07 controla exclusivamente cuántas filas se envían por serial
- Escala a cualquier tamaño de dataset de producción sin tocar el firmware

---

## 10. Uso recomendado de `max_rows` según contexto

| Contexto | max_rows | Tiempo f072 | Inferencias positivas |
|----------|----------|-------------|----------------------|
| Test de humo / CI rápido | 1.000 | ~1.7 min | ~150 |
| Desarrollo diario con QEMU | **5.000** | **~8 min** | **~750** |
| Pre-release / validación seria | 10.000 | ~17 min | ~1.500 |
| Validación completa del modelo | null | ~58 min | ~5.274 |

El valor `max_rows=5.000` es el equilibrio recomendado para desarrollo con QEMU: estadísticamente robusto y completa en tiempo razonable.

Para el **pipeline de producción** (dataset completo), el objetivo es correr sin `max_rows` y que el binario quepa. La opción C es la solución correcta a largo plazo para que esto sea independiente del tamaño del dataset.

---

## 11. Error concreto sin max_rows (o con demasiadas filas)

```
Error: app partition is too small for binary MLOps4OFP.bin size 0x226240:
  - Part 'factory' 0/0 @ 0x10000 size 0x100000 (overflow 0x126240)
```

- Binario: `0x226240` = 2.254.400 bytes (2.2 MB)
- Partición factory: `0x100000` = 1.048.576 bytes (1 MB)
- Overflow: `0x126240` ≈ 1.2 MB

Este error ocurre en la fase de **build** (f072, paso de compilación Docker), no en el flasheo ni en la comunicación serie.
