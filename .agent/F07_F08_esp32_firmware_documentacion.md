# ESP32 Firmware — Documentación completa del código C/C++

Aplica tanto a F07 (`esp32_project/` de una variante f07_modval) como a F08 (`esp32_project/` de una variante f08_sysval). La estructura de archivos es idéntica; lo único que varía entre fases es el contenido de los archivos generados.

---

## Índice

1. [Mapa de archivos](#1-mapa-de-archivos)
2. [Archivos estáticos del template](#2-archivos-estáticos-del-template)
3. [Archivos generados por variant (build_generated/)](#3-archivos-generados-por-variant-build_generated)
4. [Archivo generado: model_resolver.h](#4-archivo-generado-model_resolverh)
5. [Flujo de ejecución completo](#5-flujo-de-ejecución-completo)
6. [Tareas FreeRTOS y arquitectura de concurrencia](#6-tareas-freertos-y-arquitectura-de-concurrencia)
7. [Sistema de trazas — protocolo serie de salida](#7-sistema-de-trazas--protocolo-serie-de-salida)
8. [Modo serial vs modo memoria](#8-modo-serial-vs-modo-memoria)
9. [Diferencias F07 vs F08 en el firmware](#9-diferencias-f07-vs-f08-en-el-firmware)

---

## 1. Mapa de archivos

```
esp32_project/
│
├── CMakeLists.txt                   ← proyecto raíz ESP-IDF
├── sdkconfig                        ← configuración de componentes ESP-IDF
├── sdkconfig.defaults               ← valores por defecto (fuente de verdad)
├── dependencies.lock                ← versiones fijadas de componentes IDF
│
├── main/
│   ├── CMakeLists.txt               ← registra fuentes y dependencias del componente
│   │
│   │── Código C/C++ estático (template, no cambia entre variantes)
│   ├── main.c                       ← app_main(): orquestador principal
│   ├── data_reader.c / .h           ← fuente de datos: serial o memoria
│   ├── events_mgr.c / .h            ← buffer deslizante de eventos + fingerprint
│   ├── models_mgr.c / .h            ← registro de modelos + activación
│   ├── scheduler.c / .h             ← planificador EDF de slots temporales
│   ├── predictions_mgr.c / .h       ← gestor de inferencias (2 tasks FreeRTOS)
│   ├── tflite_runner.cpp / .h       ← motor TFLM con arena compartida
│   ├── trace.c / .h                 ← telemetría no bloqueante por UART
│   │
│   │── Generado por f071/f082 (varía por variante)
│   └── model_resolver.h             ← operadores TFLM necesarios (unión de modelos)
│
├── build_generated/                 ← 100% generado por Python, nunca editar a mano
│   ├── config.h                     ← constantes de tiempo real y modo de lectura
│   ├── models_data.c                ← binarios TFLite embebidos como arrays C
│   └── memory_events.h              ← dataset embebido (o placeholder de 1 fila)
│
└── data/
    └── input_dataset.csv            ← dataset de entrada (copia, usado en modo serial)
```

---

## 2. Archivos estáticos del template

### 2.1 `main/main.c` — Punto de entrada

**Función:** `app_main()` — única función requerida por ESP-IDF; sustituye a `main()`.

**Responsabilidades:**
- Inicializa el sistema de trazas UART (`trace_init`).
- Inicializa el registro de modelos (`models_mgr_init`) y el runner TFLM (`tflite_runner_init`).
- Crea el gestor de eventos deslizante (`events_mgr_create`).
- Sube la prioridad de la tarea actual a `tskIDLE_PRIORITY + 24`.
- Inicializa el gestor de predicciones, que lanza las dos tareas FreeRTOS de inferencia (`prediction_mgr_init`).
- Emite 3 tramas de referencia de heap antes del primer ciclo (para que f073/f084 tengan `heap_total_ref`).
- Entra en el **bucle principal de tiempo real** que se ejecuta cada `TUNIT_MS` ms.

**Bucle principal (`while(1)`):**

```c
vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(TUNIT_MS));   // espera al siguiente TU

read_events(events, MAX_EVENTS);          // lee la ventana de eventos del TU actual
events_mgr_add(mgr, ts_tu, events, cnt); // añade al buffer deslizante OW

stored = events_mgr_get_at(mgr, ts_tu, &stored_len);     // recupera ventana actual
activated = models_mgr_get_models_for_events(stored, ...); // decide qué modelos activar

scheduler_schedule(activated, num_models, ts_tu, &result); // asigna slots temporales

// modelos rechazados → TRACE_FUNC_OFFLOAD
// modelos aceptados → prediction_mgr_start(result.accepted, ...)
```

**Constantes usadas:** `TUNIT_MS`, `OW_MS`, `MTI_MS` (todas de `config.h`).

---

### 2.2 `main/data_reader.c` + `data_reader.h` — Fuente de eventos

**Responsabilidad:** Proporcionar los eventos del TU actual al bucle principal. Implementa `read_events(buffer, max_count) → size_t`.

**Dos implementaciones seleccionadas en tiempo de compilación** mediante `#if USE_SERIAL_READER`:

| Modo | `USE_SERIAL_READER` | Comportamiento |
|---|---|---|
| **Serial** | `1` | Lee bytes de UART0 con timeout de 10 ms; parsea CSV de enteros separados por `,` o `\n` |
| **Memoria** | `0` (default) | Lee de `memory_events[]` embebido en `memory_events.h`; avanza índice estático `_mem_index` |

En modo serial, la función es **no bloqueante** (timeout corto): si no llegan datos en 10 ms, devuelve 0 y el bucle sigue.

En modo memoria, el índice avanza uno a uno; cuando se agota el array, siempre devuelve 0.

**Tipo `event_t`:** definido en `config.h` como `uint8_t`. Cada elemento representa un tipo de evento de la ventana deslizante (un byte por evento).

---

### 2.3 `main/events_mgr.c` + `events_mgr.h` — Buffer deslizante de ventanas

**Responsabilidad:** Mantener un historial de ventanas de eventos ordenadas por timestamp, con limpieza automática de las más antiguas.

**Estructura interna:** lista enlazada de `events_mgr_entry_t { uint64_t time, event_t *data, size_t length }`.

**API pública:**

| Función | Descripción |
|---|---|
| `events_mgr_create()` | Aloca el gestor (heap) |
| `events_mgr_add(mgr, time, data, len)` | Añade entrada + limpia entradas antiguas |
| `events_mgr_get_at(mgr, time, &len)` | Devuelve copia de la ventana con ese timestamp exacto |
| `events_mgr_get_range(mgr, start, end, &len)` | Devuelve todas las ventanas en rango (concatenadas) |
| `events_mgr_cleanup(mgr, now)` | Elimina entradas con `time < now - 2*OW_MS` |
| `events_mgr_fingerprint(events, n)` | Hash FNV-1a de 32 bits sobre el array de eventos |
| `events_mgr_destroy(mgr)` | Libera toda la memoria |

**Ventana de retención:** `2 × OW_MS` — se guardan las últimas 2 ventanas OW. Las más antiguas se eliminan automáticamente en cada `events_mgr_add`.

**Fingerprint FNV-1a:**
```c
h = 2166136261u
para cada event_t e:
    h ^= (uint8_t)e
    h *= 16777619u
```
Este hash es el mismo que calcula Python en `window_fingerprint.py` (fnv1a_32), lo que permite cruzar predicciones edge con el dataset de evaluación en f073/f084.

---

### 2.4 `main/models_mgr.c` + `models_mgr.h` — Registro y activación de modelos

**Responsabilidad:** Exponer el array global de modelos `g_models[]` y decidir qué modelos se activan en cada TU.

**Struct `model_t`** (definida en `models_mgr.h`):

```c
typedef struct {
    const char          *name;           // nombre runtime del modelo
    const unsigned char *data;           // puntero al array TFLite en flash
    size_t               size;           // tamaño del binario TFLite en bytes
    uint64_t             exec_time;      // ITmax en ms (tiempo máximo de inferencia)
    float                threshold;      // umbral de clasificación binaria
    size_t               arena_required; // bytes de arena TFLM necesarios
    const event_t       *triggers;       // tipos de evento que activan este modelo
    size_t               trigger_count;  // longitud del array triggers
    bool                 trigger_all;    // si true, se activa con cualquier evento
} model_t;
```

**`g_models[]` y `g_models_count`:** definidos en `build_generated/models_data.c`, enlazados como `extern` desde `models_data.h`.

**Lógica de activación** (`models_mgr_get_models_for_events`):
- Si `trigger_all == true`: el modelo siempre se añade a los activados.
- Si `trigger_all == false`: solo se activa si el primer evento de la ventana coincide con algún valor en `triggers[]`.

**`models_mgr_init`:** imprime por UART una línea `0,MODEL_MEM,...` por modelo (informativa, capturada en el log de monitor).

---

### 2.5 `main/scheduler.c` + `scheduler.h` — Planificador de slots temporales

**Responsabilidad:** Dado un conjunto de modelos activados para el TU actual, asignar a cada uno un slot `[start_time, deadline]` secuencial dentro de la ventana temporal `MTI_MS`, y rechazar los que no caben.

**Struct `schedule_entry_t`:**
```c
typedef struct {
    const model_t *model;
    uint64_t       event_time;   // timestamp del TU (µs)
    uint64_t       start_time;   // cuando debe empezar la inferencia (µs)
    uint64_t       deadline;     // cuando debe terminar (µs)
} schedule_entry_t;
```

**Algoritmo (EDF greedy secuencial):**

```
slot_start = max(event_time + OW_MS_µs, last_used_time)
window_end = event_time + OW_MS_µs + MTI_MS_µs
current_time = slot_start

para cada modelo i:
    deadline_i = current_time + exec_time_i_µs
    si deadline_i <= window_end:
        → ACEPTADO: start=current_time, deadline=deadline_i
        current_time = deadline_i
    sino:
        → RECHAZADO (offload)

last_used_time = current_time  (si se aceptó al menos uno)
```

**Variable estática `last_used_time`:** persiste entre TUs. Garantiza que si el TU anterior dejó inferencias a medias, el nuevo TU no colisiona con ellas.

**`window_end`** = `event_time + OW_MS + MTI_MS` (en µs). La ventana OW ya habrá pasado cuando llegue el momento de ejecutar; el slot de inferencia es el tiempo posterior a OW dentro del ciclo MTI.

---

### 2.6 `main/predictions_mgr.c` + `predictions_mgr.h` — Gestor de inferencias

**Responsabilidad:** Ejecutar las inferencias aceptadas por el scheduler en sus slots temporales exactos, con control de deadline mediante timers hardware. Expone dos funciones públicas: `prediction_mgr_init` y `prediction_mgr_start`.

**Arquitectura de dos tareas FreeRTOS:**

```
Core 0                              Core 1
──────────────────────────          ──────────────────────────
manager_task (pred_mgr)             worker_task (pred_worker)
  prioridad: MAX-1                    prioridad: MAX-2
  xQueueReceive(batch_queue)          ulTaskNotifyTake() espera notif.
  para cada slot en el batch:
    armar start_timer (delay µs)
    armar deadline_timer (dead µs)
    espera BIT_START o BIT_DEADLINE
    si BIT_START llega primero:
      xTaskNotifyGive(worker)  ──────→  ejecuta tflite_runner_run()
      espera BIT_DONE o BIT_DEADLINE    xTaskNotify(mgr, BIT_DONE)
      si BIT_DONE: OK → TRACE_FUNC_PRED
      si BIT_DEADLINE: mata worker,
        crea nuevo worker,
        TRACE_FUNC_URGENT
    si BIT_DEADLINE llega primero:
      cancela start_timer
      TRACE_FUNC_URGENT
```

**Timers hardware (esp_timer):**
- `start_timer`: dispara `BIT_START` en el ISR cuando llega el momento de inicio del slot.
- `deadline_timer`: dispara `BIT_DEADLINE` en el ISR si se supera el deadline. Cuando dispara durante una inferencia activa, el worker task es **destruido y recreado** para limpiar el estado.

**Cola `s_batch_queue`:** capacidad 1024. `prediction_mgr_start` copia el batch de `schedule_entry_t` y lo encola. El manager task lo consume de forma desacoplada del bucle principal.

**`s_events` y `ev_count`:** el manager recupera los eventos del TU via `events_mgr_get_at` y los pasa al worker, que los usa como input para TFLM.

---

### 2.7 `main/tflite_runner.cpp` + `tflite_runner.h` — Motor TFLM

**Responsabilidad:** Gestionar el intérprete TensorFlow Lite for Microcontrollers (TFLM), ejecutar inferencias y devolver resultado binario (0/1).

**Estado global (estático, en RAM):**

| Variable | Tipo | Descripción |
|---|---|---|
| `s_arena` | `uint8_t*` | Arena de tensores compartida entre modelos; tamaño = max(arena_required) |
| `s_arena_size` | `size_t` | Tamaño de la arena en bytes |
| `s_resolver` | `MicroMutableOpResolver*` | Resolver de operadores TFLM; reutilizado entre inferencias |
| `s_interpreter_storage` | `unsigned char[]` | Buffer estático para placement new del intérprete (evita heap en cada inferencia) |
| `s_interpreter` | `MicroInterpreter*` | Puntero al intérprete activo (o nullptr) |

**`tflite_runner_init(models, count)`:**
1. Calcula `s_arena_size = max(arena_required)` sobre todos los modelos.
2. Aloca `s_arena` en heap (una sola vez al arranque).
3. Crea y configura `s_resolver` con `SetupModelResolver()` (de `model_resolver.h`).
4. Ejecuta `validate_model_once` por cada modelo: instancia intérprete en arena, `AllocateTensors()`, verifica tipos de tensor. Si falla cualquiera → `abort()`.

**`tflite_runner_run(model, input_data, input_len, result, output_len)`:**
```
destroy_interpreter()           ← destruye el intérprete anterior (placement delete)
memset(s_arena, 0, s_arena_size) ← limpia arena
new (s_interpreter_storage) MicroInterpreter(flat, resolver, arena, arena_size)
AllocateTensors()
copia input_data → tensor de entrada (int8 o uint8)
Invoke()                        ← inferencia
lee out->data.int8[0]
prob = (quantized - zero_point) * scale
*result = (prob > model->threshold) ? 1 : 0
```

**Arena compartida:** un único bloque de RAM reutilizado por todos los modelos secuencialmente. El intérprete anterior se destruye explícitamente (placement delete: `s_interpreter->~MicroInterpreter()`) antes de construir el nuevo, sin pasar por `malloc`/`free` en cada inferencia.

**Cuantización de salida:** la red devuelve un `int8` cuantizado. Se dequantiza a float con `scale` y `zero_point` del tensor de salida, y se compara con `model->threshold`.

---

### 2.8 `main/trace.c` + `trace.h` — Telemetría UART no bloqueante

**Responsabilidad:** Emitir tramas de instrumentación y resultado al host por UART0 (mismo canal que recibe el dataset en modo serial, pero en sentido contrario). La función es **no bloqueante**: si el buffer TX está lleno, descarta la trama (drop counter interno).

**Formato de trama CSV:**
```
<ts_emit_µs>,<event_id>,<model_id>,<tu_µs>,<a>,<b>,<c>\n
```

- `ts_emit_µs`: timestamp del momento de emisión (µs, monótono).
- `event_id`: código del evento (enum `trace_event_t`).
- `model_id`: índice del modelo (−1 = sistema).
- `tu_µs`: timestamp del TU al que pertenece el evento.
- `a`, `b`, `c`: campos de payload dependientes del tipo de evento.

**Dos categorías de eventos:**

| Categoría | Prefijo | Activos siempre |
|---|---|---|
| **Funcionales** | `FUNC_*` | Sí (`TRACE_FUNC_*` macros) |
| **Instrumentación** | `INST_*` | Solo si `ENABLE_TRACES` está definido en `config.h` |

**Eventos funcionales** (los que parsea f073/f084):

| Evento | ID | Payload (a, b, c) | Significado |
|---|---|---|---|
| `FUNC_PRED_RESULT` | 1 | fingerprint, y_pred, 0 | Predicción completada: resultado 0 o 1 |
| `FUNC_OFFLOAD_RESULT` | 2 | 0, 0, 0 | Modelo rechazado por el scheduler (no cabe en MTI) |
| `FUNC_URGENT_RESULT` | 3 | fingerprint, 0, 0 | Deadline superado durante inferencia activa |

**Eventos de instrumentación relevantes** (para análisis de timing):

| Evento | Descripción |
|---|---|
| `INST_SYS_P0_MEM_TOTAL_REF` | Referencia de heap al arranque: a=total, b=free0, c=min0 |
| `INST_SYS_P0_TU_WAKE` | Inicio de TU (despertar de `vTaskDelayUntil`) |
| `INST_SYS_P1_READ_EVENTS` | Fin de lectura de eventos; a=count |
| `INST_SYS_P1_SCHED_DECISION` | Resultado del scheduler; a=accepted, b=rejected |
| `INST_MOD_P2_INF_START` | Inicio de inferencia TFLM |
| `INST_MOD_P2_INF_END` | Fin de inferencia TFLM |
| `INST_MOD_PX_WDG_FIRE` | Timer de deadline disparado |

---

## 3. Archivos generados por variant (`build_generated/`)

Estos archivos los genera Python (f071/f082) y **nunca se editan a mano**. Cambian en cada variante.

### 3.1 `build_generated/config.h`

Constantes globales de compilación. Ejemplo real (variante v7_5001):

```c
#define ENABLE_TRACES    1           // 1 → activa TRACE_INST; 0 → solo funcionales
#define USE_SERIAL_READER 0          // 0 → modo memoria; 1 → modo serial UART

#define TUNIT_MS  100                // duración de cada unidad de tiempo (ms)
#define OW_MS     60000              // duración de la ventana observacional (ms)
#define MTI_MS    100                // presupuesto máximo de inferencia (ms)
#define MIT_MS    MTI_MS             // alias legacy

typedef uint8_t event_t;            // tipo de un evento (1 byte)
```

`OW_MS` = `Tu_ms * OW` (parámetros de la firma del modelo).  
`MTI_MS` = `effective_time_ms` del modelo (para F07) o suma de `effective_time_ms` de todos los modelos (para F08).

### 3.2 `build_generated/models_data.c`

Contiene los binarios TFLite embebidos como arrays C + la definición de `g_models[]`.

Estructura por cada modelo:
```c
// Binario TFLite como array de bytes
static const unsigned char <NOMBRE>[] = { 0x1c, 0x00, ... };
static const size_t   <NOMBRE>_len            = 61752;       // bytes del modelo
static const uint64_t <NOMBRE>_exec_time      = 100;         // ITmax en ms
static const float    <NOMBRE>_threshold      = 0.4859f;     // umbral clasificación
static const size_t   <NOMBRE>_arena_required = 92628;       // bytes arena TFLM
static const event_t  <NOMBRE>_triggers[]     = {0};         // tipos disparadores
static const size_t   <NOMBRE>_trigger_count  = 0;
static const bool     <NOMBRE>_trigger_all    = true;        // siempre activo

// Array global de modelos (1 entrada por modelo)
const model_t g_models[] = {
    {
        .name          = "battery_overheat-cnn1d-v5_0019",
        .data          = <NOMBRE>,
        .size          = <NOMBRE>_len,
        .exec_time     = <NOMBRE>_exec_time,
        .threshold     = <NOMBRE>_threshold,
        .arena_required = <NOMBRE>_arena_required,
        .triggers      = <NOMBRE>_triggers,
        .trigger_count = <NOMBRE>_trigger_count,
        .trigger_all   = <NOMBRE>_trigger_all,
    },
    // ... más modelos en F08
};
const size_t g_models_count = sizeof(g_models) / sizeof(g_models[0]);
```

En **F07**: un solo modelo, `trigger_all=true`.  
En **F08**: N modelos, uno por variante F07 seleccionada, todos con `trigger_all=true`.

### 3.3 `build_generated/memory_events.h`

Dataset embebido para modo memoria (`USE_SERIAL_READER=0`). Ejemplo con 1 fila placeholder (caso `EMBED_DATASET=False`):

```c
static const event_t memory_event_0[] = { 11, 8, 11, 8, ... };  // 16 bytes

static const event_t *memory_events[]       = { memory_event_0 };
static const size_t   memory_events_lengths[] = { 16 };
static const size_t   memory_events_count    = 1;
```

Cuando `EMBED_DATASET=True`, contiene todas las filas del dataset (o `max_rows`), cada una como un array de `event_t`.

---

## 4. Archivo generado: `model_resolver.h`

Generado por `generate_tflm_resolver()` (Python). Define la función `SetupModelResolver` que registra en el `MicroMutableOpResolver` exactamente los operadores TFLM que necesitan los modelos de la variante.

```cpp
// Ejemplo para un modelo CNN1D con operadores CONV_2D, FULLY_CONNECTED, etc.
template <int N>
void SetupModelResolver(tflite::MicroMutableOpResolver<N> &resolver) {
    resolver.AddConv2D();
    resolver.AddDepthwiseConv2D();
    resolver.AddFullyConnected();
    resolver.AddQuantize();
    resolver.AddDequantize();
    // ...
}

#define MODEL_OPERATOR_COUNT  8   // número de operadores registrados
```

`MODEL_OPERATOR_COUNT` debe coincidir exactamente con el parámetro template del resolver en `tflite_runner.cpp`.

---

## 5. Flujo de ejecución completo

```
╔══════════════════════════════════════════════════════════════════════════╗
║  ARRANQUE  (app_main, una sola vez)                                     ║
╚══════════════════════════════════════════════════════════════════════════╝

trace_init(115200)
  └─ Configura UART0 con buffer TX/RX 4096 bytes

models_mgr_init()
  └─ Imprime línea 0,MODEL_MEM,... por cada modelo en g_models[]
  └─ (Informativa; no inicializa estado)

count_models_that_fit()
  └─ Prueba AllocateTensors() en arena temporal para cada modelo
  └─ Imprime cuántos modelos caben efectivamente en memoria

tflite_runner_init(g_models, g_models_count)
  └─ Calcula s_arena_size = max(arena_required de todos los modelos)
  └─ malloc(s_arena_size) → s_arena  (única allocación de arena en toda la vida)
  └─ Crea MicroMutableOpResolver → SetupModelResolver()
  └─ validate_model_once() para cada modelo: AllocateTensors + comprueba tipos
     └─ Si falla → abort()

events_mgr_create()
  └─ malloc de la estructura de lista enlazada vacía

vTaskPrioritySet(NULL, PRIORITY_MAIN)  ← sube prioridad de app_main a MAX-24

prediction_mgr_init(mgr)
  └─ Crea s_batch_queue (capacidad 1024)
  └─ Crea esp_timer start_timer (ISR → BIT_START)
  └─ Crea esp_timer deadline_timer (ISR → BIT_DEADLINE)
  └─ xTaskCreatePinnedToCore(worker_task, core=1, prio=MAX-2)
  └─ xTaskCreatePinnedToCore(manager_task, core=0, prio=MAX-1)

── Emite 3 tramas INST_SYS_P0_MEM_TOTAL_REF (referencia heap) ──

╔══════════════════════════════════════════════════════════════════════════╗
║  BUCLE PRINCIPAL  (app_main, se repite cada TUNIT_MS ms)                ║
╚══════════════════════════════════════════════════════════════════════════╝

vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(TUNIT_MS))
  └─ Espera hasta el siguiente tick de TU
  └─ TRACE: INST_SYS_P0_TU_WAKE

cnt = read_events(events, MAX_EVENTS)
  │
  ├─ [Modo serial] uart_read_bytes(UART0, buf, 1024, timeout=10ms)
  │    └─ parsea CSV de uint8: "11,8,11,8,...\n"
  │
  └─ [Modo memoria] devuelve memory_events[_mem_index++]
       └─ si agotado → cnt=0

si cnt == 0: continue (no hay datos, siguiente TU)

TRACE: INST_SYS_P1_READ_EVENTS (a=cnt)

events_mgr_add(mgr, ts_tu, events, cnt)
  └─ Añade nodo a la lista enlazada con timestamp=ts_tu
  └─ events_mgr_cleanup: elimina nodos con time < ts_tu - 2*OW_MS_µs

stored = events_mgr_get_at(mgr, ts_tu, &stored_len)
  └─ Recupera copia de los eventos de exactamente este TU

activated[] = models_mgr_get_models_for_events(stored, stored_len, &num_models)
  └─ Para cada modelo en g_models[]:
       si trigger_all=true → siempre activa
       sino → activa si stored[0] ∈ triggers[]

TRACE: INST_SYS_P1_SCHED_START

scheduler_schedule(activated, num_models, ts_tu, &result)
  └─ slot_start = max(ts_tu + OW_MS_µs, last_used_time)
  └─ window_end = ts_tu + OW_MS_µs + MTI_MS_µs
  └─ Para cada modelo activado:
       deadline = current_time + exec_time_µs
       si deadline ≤ window_end → ACEPTADO (start=current_time, deadline=deadline)
                                    current_time = deadline
       sino → RECHAZADO

TRACE: INST_SYS_P1_SCHED_DECISION (a=accepted, b=rejected)

Para cada modelo rechazado:
  └─ TRACE: FUNC_OFFLOAD_RESULT (model_id, ts_tu)

prediction_mgr_start(result.accepted, result.accepted_count)
  └─ Duplica el array de schedule_entry_t en heap
  └─ xQueueSend(s_batch_queue, batch)
  └─ TRACE: INST_SYS_P1_QUEUE_SEND

scheduler_free_result(&result)
TRACE: INST_SYS_P3_TU_END

╔══════════════════════════════════════════════════════════════════════════╗
║  TASK: manager_task (Core 0, prio MAX-1)                                ║
║  Se ejecuta en paralelo al bucle principal                               ║
╚══════════════════════════════════════════════════════════════════════════╝

xQueueReceive(s_batch_queue, &batch)  ← espera lote del scheduler

s_events = events_mgr_get_at(mgr, batch.entries[0].event_time, &ev_count)
fp = events_mgr_fingerprint(s_events, ev_count)  ← FNV-1a de la ventana

Para cada slot en el batch (secuencial):

  TRACE: INST_MOD_P1_TIMER_ARM_BEG

  delay_us  = slot.start_time - now_us    (o 0 si ya pasó)
  dead_us   = slot.deadline - now_us

  si dead_us ≤ 0:
    └─ TRACE: FUNC_URGENT_RESULT → continuar al siguiente slot

  esp_timer_start_once(start_timer, delay_us)
  esp_timer_start_once(deadline_timer, dead_us)

  TRACE: INST_MOD_P1_TIMER_ARM_END

  xTaskNotifyWait(BIT_START | BIT_DEADLINE)  ← espera timer

  si BIT_DEADLINE llegó primero:
    └─ cancela start_timer
    └─ TRACE: FUNC_URGENT_RESULT
    └─ continuar al siguiente slot

  [BIT_START llegó → hora de inferir]
  TRACE: INST_MOD_P0_MODEL_BEGIN

  xTaskNotifyGive(worker_task)  ── despierta worker en Core 1

  xTaskNotifyWait(BIT_DONE | BIT_DEADLINE)

  si BIT_DEADLINE llegó durante inferencia:
    └─ vTaskDelete(worker_task)      ← mata la tarea bloqueada en TFLM
    └─ xTaskCreatePinnedToCore(worker_task, ...) ← crea nueva tarea limpia
    └─ TRACE: FUNC_URGENT_RESULT

  si BIT_DONE (inferencia OK):
    └─ cancela deadline_timer
    └─ TRACE: INST_MOD_P3_MODEL_END
    └─ TRACE: FUNC_PRED_RESULT (model_id, ts_tu, fp, pred_result)

free(s_events) → free(batch.entries)

╔══════════════════════════════════════════════════════════════════════════╗
║  TASK: worker_task (Core 1, prio MAX-2)                                 ║
╚══════════════════════════════════════════════════════════════════════════╝

ulTaskNotifyTake()  ← duerme hasta que manager_task le despierte

slot = s_slot  (copiado por manager)

TRACE: INST_MOD_P2_INF_START

tflite_runner_run(slot.model, s_events, ev_count, &pred_result, ...)
  └─ destroy_interpreter()
  └─ memset(s_arena, 0, s_arena_size)
  └─ new (storage) MicroInterpreter(flat, resolver, arena, arena_size)
  └─ AllocateTensors()
  └─ copia s_events → input tensor (int8/uint8)
  └─ Invoke()   ← INFERENCIA REAL TFLM
  └─ dequantiza salida int8 → float
  └─ pred_result = (prob > threshold) ? 1 : 0

TRACE: INST_MOD_P2_INF_END

xTaskNotify(manager_task, BIT_DONE)
```

---

## 6. Tareas FreeRTOS y arquitectura de concurrencia

```
Core 0                              Core 1
──────────────────────────────      ──────────────────────────
app_main         (prio 24)          worker_task  (prio MAX-2)
manager_task     (prio MAX-1)

Comunicación:
  app_main → manager_task:   xQueue (batch de schedule_entry_t)
  manager_task → worker_task: xTaskNotifyGive / ulTaskNotifyTake
  worker_task → manager_task: xTaskNotify(BIT_DONE)
  ISR start_timer → manager:  xTaskNotifyFromISR(BIT_START)
  ISR deadline_timer → manager: xTaskNotifyFromISR(BIT_DEADLINE)
```

**Por qué dos tareas:** el manager controla el timing (timers, slots) sin bloquearse en la inferencia TFLM. El worker hace la inferencia pesada en Core 1. Si el deadline expira, el manager puede matar al worker sin afectar su propio estado.

**Memoria compartida entre tareas:**  
`s_events`, `ev_count`, `s_slot`, `pred_result` son variables globales estáticas del módulo. No hay mutex porque el protocolo de notificaciones garantiza acceso secuencial (el manager escribe, el worker lee cuando recibe la notificación, el manager no vuelve a escribir hasta que recibe BIT_DONE o mata al worker).

---

## 7. Sistema de trazas — protocolo serie de salida

Cada línea emitida tiene el formato:
```
<ts_µs>,<event_id>,<model_id>,<tu_µs>,<a>,<b>,<c>
```

Ejemplo de secuencia real para un TU con una inferencia exitosa:
```
1234500,4,-1,1234000,0,0,0       ← INST_SYS_P0_TU_WAKE
1234600,6,-1,1234000,16,0,0      ← INST_SYS_P1_READ_EVENTS (16 eventos)
1234650,9,-1,1234000,1,0,0       ← INST_SYS_P1_SCHED_DECISION (1 aceptado, 0 rechazados)
1234700,13,-1,1234000,1,0,0      ← INST_MOD_P0_CPM_BEGIN (1 modelo en batch)
1234750,17,0,1234000,0,0,0       ← INST_MOD_P0_MODEL_BEGIN (modelo 0)
1234800,19,0,1234000,0,0,0       ← INST_MOD_P2_INF_START
1234850,20,0,1234000,0,0,0       ← INST_MOD_P2_INF_END
1234860,1,0,1234000,3876543210,1,0 ← FUNC_PRED_RESULT (fp=3876543210, y_pred=1)
1234900,14,-1,1234000,0,0,0      ← INST_MOD_P3_CPM_END
1234950,11,-1,1234000,0,0,0      ← INST_SYS_P3_TU_END
```

Los parsers Python (`scripts/runtime_analysis/parse.py`) consumen este formato para generar los DataFrames de análisis.

---

## 8. Modo serial vs modo memoria

| Aspecto | Modo serial (`USE_SERIAL_READER=1`) | Modo memoria (`USE_SERIAL_READER=0`) |
|---|---|---|
| Fuente de datos | UART0 (115200 baud, mismo cable que el monitor) | Array `memory_events[]` en flash (compilado) |
| Cuándo se activa | `EMBED_DATASET=False` en f071/f082 (default) | `EMBED_DATASET=True` en f071/f082 |
| Dataset en la imagen | No (solo placeholder de 1 fila en memory_events.h) | Sí (todas las filas del dataset embebidas) |
| Envío desde host | f072/f083 envía `08_input_dataset.csv` línea a línea | No se necesita nada del host |
| `read_events()` | Polling no bloqueante con timeout 10 ms | Lectura secuencial de array; avanza índice |
| Tamaño del binario | Mínimo (el modelo es lo más grande) | Puede crecer mucho si el dataset es grande |
| Uso típico | Producción y validación estándar | Debug o testing sin cable serie disponible |

En ambos modos, UART0 se usa también para **emitir trazas** (sentido salida). En modo serial el mismo cable gestiona los dos sentidos: el host envía filas CSV y el ESP32 responde con líneas de traza.

---

## 9. Diferencias F07 vs F08 en el firmware

El código C/C++ es **idéntico**. Lo único que varía es el contenido de `build_generated/`:

| Archivo generado | F07 | F08 |
|---|---|---|
| `config.h` → `MTI_MS` | `effective_time_ms` del único modelo | suma de `effective_time_ms` de todos los modelos seleccionados |
| `models_data.c` → `g_models[]` | 1 entrada (1 modelo TFLite) | N entradas (N modelos TFLite) |
| `models_data.c` → `g_models_count` | `1` | `N` |
| `model_resolver.h` → operadores | operadores del único modelo | unión de operadores de todos los modelos |
| `memory_events.h` | placeholder 1 fila | placeholder 1 fila (misma lógica) |

**En runtime:**
- F07: el scheduler siempre tiene 1 único candidato, que siempre cabe (MTI_MS = exec_time del modelo).
- F08: el scheduler tiene N candidatos y asigna slots secuenciales; si alguno no cabe en la ventana MTI_MS → `FUNC_OFFLOAD_RESULT`.

La lógica de multi-modelo está latente en F07 (el array `g_models[]` podría tener más de un elemento), pero en la práctica F07 siempre genera 1 modelo.
