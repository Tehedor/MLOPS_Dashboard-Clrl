# Fase 8 — System Validation (Multi-Model Edge) — Documentación completa

## Índice

1. [Visión general](#1-visión-general)
2. [Prerequisitos y dependencias de fases anteriores](#2-prerequisitos-y-dependencias-de-fases-anteriores)
3. [Script f081 — SelectConfig](#3-script-f081--selectconfig)
4. [Script f082 — PrepareBuild](#4-script-f082--preparebuild)
5. [Script f083 — FlashRun](#5-script-f083--flashrun)
6. [Script f084 — Post (análisis)](#6-script-f084--post-análisis)
7. [Flujo completo de extremo a extremo](#7-flujo-completo-de-extremo-a-extremo)
8. [Parámetros del Makefile](#8-parámetros-del-makefile)
9. [Artefactos de salida](#9-artefactos-de-salida)
10. [Diferencias clave respecto a F07](#10-diferencias-clave-respecto-a-f07)

---

## 1. Visión general

La Fase 8 (`f08_sysval`) es la **validación de sistema multi-modelo en hardware edge**. A diferencia de F07 (que valida un único modelo TFLite), F08 toma como entrada múltiples variantes de F07 ya validadas y las despliega juntas en el ESP32, ejecutándolas de forma secuencial dentro de una ventana temporal `MTI_MS` (Maximum Total Inference time, en ms).

El nombre interno es `f08_sysval` y genera sus artefactos en `executions/f08_sysval/<variant>/`.

La fase se divide en cuatro scripts independientes que se ejecutan en secuencia:

```
f081_selectconfig.py  →  f082_preparebuild.py  →  f083_flashrun.py  →  f084_post.py
    (selección ILP)         (generación proyecto)    (build/flash/run)     (análisis)
```

La novedad principal respecto a F07 es el paso de **selección óptima de modelos**: dado un conjunto de candidatos F07, F081 elige cuáles caben dentro de los presupuestos de tiempo y memoria usando un algoritmo MILP (Mixed Integer Linear Programming), específicamente Dinkelbach para maximizar recall global.

---

## 2. Prerequisitos y dependencias de fases anteriores

F08 puede tener **varios padres F07** (uno por cada modelo candidato). Cada padre debe haber completado F07 correctamente.

De cada padre F07, F081 requiere:

| Campo en F07 | Uso en F08 |
|---|---|
| `exports.edge_capable: true` | Filtro de entrada; si es `false`, el padre se excluye |
| `07_model_profile.yaml` | Fuente de datos de timing, memoria y métricas de calidad |
| `artifacts.model_tflite` | Ruta al binario TFLite compilado |
| `artifacts.evaluation_dataset_csv` | Dataset para evaluación con ground-truth (cruce fingerprint→label) |
| `artifacts.input_dataset_csv` | Dataset de entrada para inferencia en edge |
| `timing.itmax_ms` | Latencia máxima de inferencia medida en hardware |
| `build.arena_bytes` | Tamaño de arena TFLM requerido |
| `build.arena_global_bytes` | Arena global para multi-modelo |
| `build.model_size_bytes` | Peso del binario del modelo en bytes |
| `build.operators` | Lista de operadores TFLite (para el resolver) |
| `input_signature.*` | Firma del tensor: Tu, OW, LT, PW, event_type_count, input/output shape y dtype |
| `quality.*` / `metrics_quality_models.csv` / `metrics_prediction.csv` | TP, TN, FP, FN, precision, recall |
| `metrics_memory.csv` | `heap_total_ref` — heap disponible real en la placa |

> **Constraint de firma compartida:** todos los modelos seleccionados deben compartir la misma `input_signature` (mismos Tu, OW, LT, PW, event_type_count, input/output dtype y output_shape). La firma puede diferir en `input_shape` (no se valida) pero no en las dimensiones de salida.

---

## 3. Script f081 — SelectConfig

**Archivo:** `scripts/phases/f081_selectconfig.py`

**Propósito:** Seleccionar el subconjunto óptimo de modelos F07 que quepa dentro de los presupuestos de tiempo y memoria, y generar la configuración de sistema para F082.

### 3.1 Entrada

- `executions/f08_sysval/<variant>/params.yaml` — parámetros de la variante.
- `executions/f07_modval/<parent>/outputs.yaml` — para cada padre.
- `executions/f07_modval/<parent>/07_model_profile.yaml` — perfil del modelo.
- `executions/f07_modval/<parent>/metrics_*.csv` — métricas auxiliares.

### 3.2 Parámetros relevantes del `params.yaml`

| Parámetro | Obligatorio | Descripción |
|---|---|---|
| `parent_variant` / `parents` | Sí | Lista de variantes F07 candidatas (string CSV o lista YAML) |
| `platform` | Sí | Plataforma edge (`esp32`) |
| `MTI_MS` | Sí | Presupuesto temporal total en ms (suma de `effective_time_ms` de todos los modelos seleccionados ≤ MTI_MS) |
| `selection_mode` | No (default: `manual`) | `manual` o `auto_ilp` |
| `objective` | No | `max_global_recall` (default) o `max_tp` |
| `time_scale_factor` | No (default: 1.0) | Factor de escala temporal para ajuste de Tu_edge |
| `max_rows` | No | Límite de filas del dataset de evaluación |
| `memory_budget_bytes` | No | Presupuesto de memoria en bytes (se combina con `heap_total_ref` del hardware) |
| `max_models` | No | Número máximo de modelos a seleccionar |
| `min_quality_score` | No | Filtro de calidad mínimo por modelo |
| `min_precision` | No | Filtro de precisión mínima por modelo |
| `min_recall` | No | Filtro de recall mínimo por modelo |
| `solver_time_limit_sec` | No (default: 30) | Tiempo límite del solver MILP |
| `virtual` | No (default: false) | Activar modo QEMU para ESP32 virtual |

### 3.3 Pipeline interno

```
Para cada padre F07:
  1. Cargar outputs.yaml → verificar edge_capable=true
  2. Cargar 07_model_profile.yaml
  3. Verificar compatibilidad de firma (platform + Tu/OW/LT/PW/event_type_count/output_dtype)
  4. Extraer métricas: TP, TN, FP, FN, itmax_ms, arena_bytes, model_size_bytes

Filtrar candidatos:
  5. Excluir si min_quality_score / min_precision / min_recall no se cumplen
  6. Excluir si positive_support ≤ 0

Calcular arena global:
  7. required_arena_bytes = max(arena_bytes) sobre candidatos factibles
  8. Calcular memory_guard_bytes = 32768 (constante)
  9. effective_memory_budget = min(memory_budget_bytes, min(heap_total_ref de padres))
  10. models_memory_budget = effective_memory_budget - required_arena_bytes - memory_guard_bytes

Selección (depende de selection_mode):
  - manual: todos los candidatos factibles, verifica que cumplan max_models + MTI_MS + memory budget
  - auto_ilp: MILP binario con PuLP/CBC, maximiza objective (Dinkelbach para max_global_recall)
```

#### Modelo de tiempo por modelo

```
effective_time_ms = ceil(itmax_ms + 5.0)
```
La constante `5.0 ms` es el overhead de gestión de ciclo. La suma de `effective_time_ms` de todos los modelos seleccionados debe ser ≤ `MTI_MS`.

#### Selección MILP — modo `auto_ilp`

Variables binarias `x_i ∈ {0,1}` por modelo candidato.

Restricciones:
- `sum(effective_time_ms_i * x_i) ≤ MTI_MS`
- `sum(model_size_bytes_i * x_i) ≤ models_memory_budget` (si se conoce el presupuesto)
- `sum(x_i) ≤ max_models` (si se especifica)
- `sum(x_i) ≥ 1`

Objetivo (default `max_global_recall`):

Maximiza exactamente el cociente:
```
sum(TP_i * x_i) / sum((TP_i + FN_i) * x_i)
```

mediante iteración de Dinkelbach:
```
Para cada iteración t:
  Maximiza sum((TP_i - λ * (TP_i + FN_i)) * x_i)
  Si gap = |sum_TP - λ * sum_support| ≤ 1e-9 → converge
  λ ← sum_TP / sum_support
```
Máximo 40 iteraciones, límite de tiempo 30 s al solver.

El objetivo alternativo `max_tp` maximiza directamente `sum(TP_i * x_i)`.

### 3.4 Salidas

| Archivo | Descripción |
|---|---|
| `08_selected_configuration.yaml` | Documento central: modelos seleccionados, firma común, agregados, presupuestos, `system_viable` |
| `08_selection_report.yaml` | Informe del solver: status, objetivo, iteraciones, calidad agregada |
| `08_candidate_summary.csv` | Tabla con todos los candidatos (seleccionados y excluidos), métricas y flags |
| `08_unique_windows.csv` | Dataset de ventanas únicas deduplicadas (union de evaluation_dataset de los modelos seleccionados) |

El campo clave de `08_selected_configuration.yaml`:
- `system_viable: true/false` — solo `true` si hay modelos seleccionados y todos son edge_capable.
- `configuration_edge_capable` — verdadero si la configuración puede ejecutarse en hardware.
- `aggregates.required_arena_bytes` — arena global (max de todos los modelos).
- `memory_check.fits` — si la configuración cabe en memoria real de la placa.

---

## 4. Script f082 — PrepareBuild

**Archivo:** `scripts/phases/f082_preparebuild.py`

**Propósito:** Generar el proyecto ESP-IDF multi-modelo listo para compilar: copiar el template, inyectar modelos, generar headers y configuración de runtime.

### 4.1 Entrada

- `08_selected_configuration.yaml` — resultado de f081.
- `edge/<platform>/template_project/` — plantilla del proyecto ESP-IDF.
- `edge/<platform>/runner/` — scripts de build/flash/run para plataformas no-esp32.
- Binarios `.tflite` de cada modelo seleccionado.
- `08_unique_windows.csv` — dataset de inferencia.

**Precondiciones obligatorias:**
- `selection_completed: true`
- `configuration_edge_capable: true`
- `system_viable: true` y al menos 1 modelo seleccionado
- `platform` consistente entre `params.yaml` y `08_selected_configuration.yaml`
- `input_dtype ∈ {int8, uint8}` y `output_dtype == int8`

### 4.2 Pipeline interno

```
1. Leer 08_selected_configuration.yaml
2. Verificar precondiciones de viabilidad
3. Copiar template_project → <variant_dir>/<platform>_project/
4. Copiar runner_dir → <variant_dir>/<platform>_runner/  (si existe runner)
5. Generar build_generated/models_data.c  (todos los TFLites embebidos como arrays C)
6. Generar main/model_resolver.h  (union de operadores TFLM)
7. Generar build_generated/config.h  (OW, MTI_MS, Tu_edge_ms)
8. Copiar 08_unique_windows.csv → data/input_dataset.csv (en proyecto) y 08_input_dataset.csv (en variant)
9. Generar build_generated/memory_events.h  (dataset embebido o placeholder)
10. Escribir 08_edge_run_config.yaml
11. Escribir 08_model_execution_plan.yaml
12. Escribir 08_system_profile.yaml (inicial, sin datos de runtime)
```

### 4.3 Archivos generados en `build_generated/`

| Archivo | Contenido |
|---|---|
| `models_data.c` | Array C para cada modelo TFLite: `const unsigned char model_N_data[] = {...}` con ID, nombre, threshold, itmax, arena, input/output bytes |
| `model_resolver.h` | `#include` de operadores TFLM (unión de todos los operadores de todos los modelos) |
| `config.h` | `#define OW`, `#define MTI_MS`, `#define TU_MS` |
| `memory_events.h` | Dataset de ventanas en C (solo 1 fila placeholder si `EMBED_DATASET=False`) |

### 4.4 Constante EMBED_DATASET

```python
EMBED_DATASET = False  # línea 8 de f082_preparebuild.py
```
- `False` (por defecto): `memory_events.h` se genera con 1 fila placeholder. El dataset se envía al ESP32 por puerto serie en tiempo de ejecución (modo `serial`).
- `True`: el dataset completo (o `max_rows` filas) se embebe en el binario. Útil para modo `memory` sin comunicación serie.

### 4.5 Cálculo de arena global en config de runtime

```
arena_global = required_arena_bytes * 1.15 + 1024
```
Este 15% de margen más 1 KB se aplica sobre el max de arenas individuales.

### 4.6 `08_edge_run_config.yaml`

Documento de configuración para f083. Campos relevantes:

```yaml
platform: esp32
virtualized: false
selection_mode: manual
execution:
  project_dir: esp32_project
  runner_dir: esp32_runner
time_scale_factor: 1.0
geometry:
  Tu_dataset: <Tu del dataset>
  Tu_edge_ms: <Tu * time_scale>
  OW: ...
  LT: ...
  PW: ...
drain:
  tu_ms: ...
  recommended_drain_seconds: ...
memory:
  arena_per_model_max: ...
  arena_global: ...
  fits: true/false
models:
  - id: 0
    name: <runtime_model_name>
    threshold: ...
    itmax: ...
    mti_ms: ...
    arena_required: ...
    model_size_bytes: ...
    input_bytes: ...
    output_bytes: ...
limits:
  MTI_MS: ...
  ITmax: <max de itmax de todos los modelos>
```

### 4.7 `08_model_execution_plan.yaml`

Plan de ejecución detallado por modelo: runtime_model_name, model_id, parent_variant, prediction_name, threshold, exec_time_ms, itmax_ms, management_overhead_ms, mti_ms, arena_required, model_size_bytes, input/output bytes, ruta al tflite, ruta al evaluation dataset y operadores.

---

## 5. Script f083 — FlashRun

**Archivo:** `scripts/phases/f083_flashrun.py`

**Propósito:** Compilar el proyecto ESP-IDF multi-modelo, flashear el ESP32 y ejecutar la inferencia enviando el dataset por serie.

Es idéntico en estructura a `f072_flashrun.py` de F07, pero opera sobre el proyecto multi-modelo generado por f082.

### 5.1 Argumentos CLI

| Argumento | Descripción |
|---|---|
| `--variant` | Variante F08 (obligatorio) |
| `--mode serial\|memory` | Modo de envío de datos (default: `serial`) |
| `--port` | Puerto serie (autodetectado si no se especifica) |
| `--baud` | Baudrate (default: 115200) |
| `--drain-seconds` | Tiempo de espera para drenado de respuestas (default: calculado desde OW, LT, MTI_MS) |
| `--build-only` | Solo compila, no flashea ni ejecuta |
| `--no-clean-build` | No borra el directorio `build/` antes de compilar |
| `--skip-flash` | Omite el flasheo (necesario para QEMU) |

### 5.2 Flujo para platform `esp32`

```
=== BUILD ===
1. Limpiar build/ (salvo --no-clean-build)
2. sync_generated_sources_for_build: copiar build_generated/ → build/build_generated/
3. sanitize_sdkconfig_for_docker: regenerar sdkconfig desde sdkconfig.defaults
4. Docker idf.py build (imagen mlops4ofp-idf:6.0)
5. export_platform_build_artifacts → platform_build_bundle/

=== FLASH ===  (saltado con --skip-flash)
6. flash_portable:
   - macOS: intenta esptool en host primero
   - Linux: prueba si Docker puede mapear el puerto serie
   - Fallback: esptool en host (python -m esptool)

=== RUN ===
7. modo serial:  serial_send_and_monitor (envía dataset línea a línea a period=Tu_ms)
8. modo memory:  serial_monitor_only (solo escucha, el dataset ya está embebido)
```

### 5.3 Flujo para otras plataformas (runner genérico)

Si `platform != esp32`, usa un runner basado en scripts shell:
- `<platform>_runner/build.sh`
- `<platform>_runner/flash.sh`
- `<platform>_runner/run.sh`

Cada script recibe variables de entorno: `F08_PLATFORM`, `F08_VARIANT`, `F08_VARIANT_DIR`, `F08_PROJECT_DIR`, `F08_EDGE_CONFIG`, `F08_INPUT_DATASET`, `F08_MODE`, `F08_BAUD`, `F08_TU_MS`, `F08_RECOMMENDED_DRAIN_SECONDS`, `F08_GEOM_OW/LT/PW`.

### 5.4 Cálculo del tiempo de drenado

```python
# Desde 08_edge_run_config.yaml → drain.recommended_drain_seconds
post_wait_s = recommended_drain_seconds

# Mínimo garantizado:
min_post_wait_s = OW * Tu_s + MTI_MS / 1000.0

# Si post_wait_s < min_post_wait_s → se ajusta automáticamente
```

### 5.5 Variables de entorno para build Docker

| Variable | Descripción |
|---|---|
| `F08_FLASH_BAUD` | Baudrate para flash (default: 115200) |
| `F08_DOCKER_MEMORY` | Límite de memoria Docker para build |
| `F08_DOCKER_MEMORY_SWAP` | Límite swap Docker |
| `F08_DOCKER_CPUS` | CPUs Docker para build |
| `F08_DOCKER_BUILD_JOBS` | Paralelismo CMake (default: 1) |

### 5.6 Salidas

| Archivo | Descripción |
|---|---|
| `08_esp_build_log.txt` | Log completo del proceso de compilación ESP-IDF |
| `08_esp_flash_log.txt` | Log del flasheo |
| `08_esp_monitor_log.txt` | Log de la comunicación serie con el ESP32 (inferencias y medidas) |
| `platform_build_bundle/` | Artefactos de build: `.bin`, `flash_args`, `flasher_args.json`, etc. |
| `application_image.bin` | Imagen de la aplicación (copia raíz) |
| `bootloader_image.bin` | Imagen del bootloader |
| `partition_table_image.bin` | Tabla de particiones |

---

## 6. Script f084 — Post (análisis)

**Archivo:** `scripts/phases/f084_post.py`

**Propósito:** Parsear el log de monitor, calcular métricas de runtime multi-modelo (latencia, memoria, outcomes), evaluar calidad de predicción por modelo cruzando con ground-truth, y generar el informe HTML y `outputs.yaml`.

### 6.1 Entrada

- `08_selected_configuration.yaml`
- `08_system_profile.yaml` (generado por f082)
- `08_edge_run_config.yaml`
- `08_model_execution_plan.yaml`
- `08_esp_monitor_log.txt` (puede estar ausente → salidas parciales)

### 6.2 Pipeline interno

```
1. Cargar 08_selected_configuration.yaml → verificar selection_completed
2. Si configuration_edge_capable=false → generar salidas vacías, outputs.yaml con phase_status="skipped_inviable"
3. Si no hay 08_esp_monitor_log.txt → salidas parciales con phase_status="partial_no_runtime"
4. Parsear log: parse_log_enriched(log_path) → DataFrame de eventos runtime
5. Aplicar model_name_map desde 08_edge_run_config.yaml (model_id → model_name)
6. compute_system_summary(df) → latencia media/máxima del ciclo del sistema
7. compute_model_metrics(df) → métricas por modelo (n_attempts, n_ok, n_wd_late, infer_ms...)
8. _extract_runtime_predictions(df) → predicciones (fingerprint, model_name, y_pred) de eventos FUNC_PRED_RESULT
9. _evaluate_predictions → cruzar predicciones con evaluation_dataset_csv por fingerprint → TP/TN/FP/FN por modelo
10. _build_quality_metrics → enriquecer métricas de runtime con métricas de calidad
11. compute_memory_summary(df) → pico de memoria heap
12. Escribir métricas CSV + YAML + JSON
13. _update_system_profile → actualizar 08_system_profile.yaml con run.esp_run_completed, timing, memory, quality
14. _write_outputs_yaml → generar outputs.yaml con exports + metrics
15. _write_html_report → informe HTML con tablas de métricas
```

### 6.3 Evaluación de predicciones por modelo

Cada modelo del plan de ejecución tiene su propio `evaluation_dataset_csv` (con `OW_events` y `label`). F084:

1. Calcula fingerprints FNV1a-32 sobre las ventanas del dataset de evaluación.
2. Cruza por fingerprint con las predicciones del log (eventos `FUNC_PRED_RESULT`).
3. Computa TP, TN, FP, FN, accuracy, precision, recall, F1, false_negative_rate.
4. `quality_score = F1` (fallback a recall, luego a accuracy).

Si un fingerprint no tiene predicción en el log (`skipped_predictions`), se excluye del cálculo.

### 6.4 Métricas del sistema (`_resolve_system_metrics`)

Agrega across todos los modelos:
- `ok_rate = sum(n_ok) / sum(n_attempts)`
- `offload_rate = sum(n_offload) / sum(n_attempts)`
- `watchdog_rate = sum(n_wd_late) / sum(n_attempts)`
- `system_quality_score = mean(quality_score por modelo)`
- `mean_model_quality_score = system_quality_score`

### 6.5 Determinación de `phase_status`

| Condición | phase_status |
|---|---|
| `selection_completed=false` | `selection_incomplete` |
| `configuration_edge_capable=false` | `skipped_inviable` |
| `total_models_selected ≤ 0` | `skipped_inviable` |
| Sin log de monitor | `partial_no_runtime` |
| Todo correcto | `completed` |

`system_viable` en el perfil final: solo `true` si `configuration_edge_capable AND system_viable_inicial AND esp_run_completed`.

### 6.6 Salidas

| Archivo | Descripción |
|---|---|
| `metrics_models.csv` | Métricas por modelo: runtime + calidad (TP, FP, recall, F1...) |
| `metrics_memory.csv` | Pico de memoria heap, heap_free_min, heap_total_ref |
| `metrics_system_timing.csv` | Timing del sistema: latencia de ciclo media/max/jitter |
| `metrics_outcomes.csv` | Outcomes por modelo: n_ok, n_fail, n_offload, ok_rate, offload_rate |
| `metrics_system_summary.yaml` | Resumen de sistema en YAML |
| `08_edge_predictions.csv` | Predicciones por (model_name, fingerprint, y_pred) |
| `08_edge_runtime_metrics_raw.json` | Payload completo de métricas raw |
| `08_system_profile.yaml` | Perfil de sistema actualizado con run/timing/memory/quality |
| `08_report.html` | Informe HTML con tablas de métricas de modelo, memoria y timing |
| `outputs.yaml` | Artefacto canónico de salida con exports + metrics |

---

## 7. Flujo completo de extremo a extremo

```
Inputs:
  - Múltiples variantes F07 completadas (edge_capable=true)
  - params.yaml de la variante F08

         ┌─────────────────────────────────────────────┐
         │  f081_selectconfig                          │
         │  • Carga perfiles F07 de cada padre         │
         │  • Verifica firma compartida                │
         │  • Filtra por calidad/edge_capable          │
         │  • Selección: manual o MILP (Dinkelbach)    │
         │  • Deduplica ventanas únicas                │
         └──────────────┬──────────────────────────────┘
                        │ 08_selected_configuration.yaml
                        │ 08_unique_windows.csv
                        ▼
         ┌─────────────────────────────────────────────┐
         │  f082_preparebuild                          │
         │  • Copia template_project → esp32_project/  │
         │  • Genera models_data.c (N TFLites)         │
         │  • Genera model_resolver.h (union ops)      │
         │  • Genera config.h (OW, MTI_MS, Tu)         │
         │  • Prepara input_dataset.csv                │
         │  • Escribe 08_edge_run_config.yaml          │
         │  • Escribe 08_model_execution_plan.yaml     │
         └──────────────┬──────────────────────────────┘
                        │ esp32_project/ listo para build
                        ▼
         ┌─────────────────────────────────────────────┐
         │  f083_flashrun                              │
         │  ── BUILD ──                                │
         │  • Docker idf.py build                      │
         │  ── FLASH ──                                │
         │  • esptool (Docker o host)                  │
         │  ── RUN ──                                  │
         │  • Serial: envío dataset línea a línea      │
         │    a período Tu_ms                          │
         │  • Captura respuestas en monitor_log.txt    │
         └──────────────┬──────────────────────────────┘
                        │ 08_esp_monitor_log.txt
                        ▼
         ┌─────────────────────────────────────────────┐
         │  f084_post                                  │
         │  • Parsea log → eventos runtime             │
         │  • Métricas por modelo (latencia, outcomes) │
         │  • Evaluación de predicciones por modelo    │
         │    (fingerprint FNV1a-32 → TP/FP/TN/FN)    │
         │  • Métricas de memoria y sistema            │
         │  • Actualiza 08_system_profile.yaml         │
         │  • Genera outputs.yaml                      │
         │  • Genera 08_report.html                    │
         └─────────────────────────────────────────────┘

Outputs finales:
  outputs.yaml          → exports + metrics (consumido por dashboard)
  metrics_models.csv    → calidad y runtime por modelo
  metrics_memory.csv    → memoria del sistema
  08_report.html        → informe visual
  08_system_profile.yaml → perfil completo del sistema multi-modelo
```

### Flujo con ESP32 virtual (QEMU)

Cuando `virtual=true` en params.yaml, el Makefile orquesta adicionalmente:

```
f082_preparebuild --virtual
→ esp32-socat-start     (crea /tmp/ttyVUSB0 vía socat)
→ f083_flashrun --build-only  (solo compila, no flashea)
→ esp32-qemu-start      (lanza QEMU con la imagen de la app)
→ esp32-flash-run-virtual → f083_flashrun --skip-flash --port /tmp/ttyVUSB0
→ f084_post
→ esp32-virt-stop
```

---

## 8. Parámetros del Makefile

### Creación de variante (`make variant8`)

```bash
make variant8 VARIANT=v801 \
    PARENTS=v700,v703,v704 \
    PLATFORM=esp32 \
    MTI_MS=100000 \
    [SELECTION_MODE=manual|auto_ilp] \
    [OBJECTIVE=max_global_recall|max_tp] \
    [TIME_SCALE=0.01] \
    [MAX_ROWS=200] \
    [MEMORY_BUDGET_BYTES=262144] \
    [MAX_MODELS=3] \
    [MIN_QUALITY_SCORE=0.8] \
    [MIN_PRECISION=0.7] \
    [MIN_RECALL=0.8] \
    [VIRTUAL=true|false]
```

`PARENTS` admite tanto formato lista YAML `[v700, v703]` como CSV `v700,v703`.

### Targets de ejecución

| Target | Descripción |
|---|---|
| `make script8 VARIANT=v801` | Flujo completo (select→prepare→flash-run→post) |
| `make script8-select-config VARIANT=v801` | Solo f081 |
| `make script8-prepare-build VARIANT=v801` | Solo f082 |
| `make script8-build-only VARIANT=v801` | Solo compilación Docker |
| `make script8-flash-run VARIANT=v801 PORT=/dev/ttyUSB0` | Solo f083 |
| `make script8-post VARIANT=v801` | Solo f084 |
| `make script8-virtualESP32 VARIANT=v801` | Flujo completo en QEMU |

### Parámetros de flash-run

| Variable | Descripción |
|---|---|
| `PORT` | Puerto serie (ej: `/dev/ttyUSB0`) |
| `MODE` | `serial` (default) o `memory` |
| `BAUD` | Baudrate (default: 115200) |
| `DRAIN_SECONDS` | Override del tiempo de drenado |

---

## 9. Artefactos de salida

Directorio: `executions/f08_sysval/<variant>/`

| Archivo | Generado por | Descripción |
|---|---|---|
| `params.yaml` | `make variant8` | Parámetros de la variante |
| `08_selected_configuration.yaml` | f081 | Configuración completa de selección |
| `08_selection_report.yaml` | f081 | Informe del solver MILP |
| `08_candidate_summary.csv` | f081 | Todos los candidatos con flags y métricas |
| `08_unique_windows.csv` | f081 | Dataset de ventanas únicas (inferencia) |
| `08_edge_run_config.yaml` | f082 | Config de runtime para f083 |
| `08_model_execution_plan.yaml` | f082 | Plan de ejecución por modelo |
| `08_input_dataset.csv` | f082 | Dataset de entrada copiado al proyecto |
| `08_system_profile.yaml` | f082 (inicial) + f084 (actualizado) | Perfil del sistema multi-modelo |
| `esp32_project/` | f082 | Proyecto ESP-IDF listo para compilar |
| `esp32_runner/` | f082 | Scripts runner para otras plataformas |
| `08_esp_build_log.txt` | f083 | Log del build Docker |
| `08_esp_flash_log.txt` | f083 | Log del flasheo |
| `08_esp_monitor_log.txt` | f083 | Log de la comunicación serie |
| `application_image.bin` | f083 | Imagen de la aplicación |
| `bootloader_image.bin` | f083 | Imagen del bootloader |
| `partition_table_image.bin` | f083 | Tabla de particiones |
| `platform_build_bundle/` | f083 | Bundle de artefactos de build |
| `metrics_models.csv` | f084 | Métricas runtime + calidad por modelo |
| `metrics_memory.csv` | f084 | Memoria del sistema |
| `metrics_system_timing.csv` | f084 | Timing del ciclo de sistema |
| `metrics_outcomes.csv` | f084 | Outcomes (ok/fail/offload) por modelo |
| `metrics_system_summary.yaml` | f084 | Resumen de sistema |
| `08_edge_predictions.csv` | f084 | Predicciones capturadas por fingerprint |
| `08_edge_runtime_metrics_raw.json` | f084 | Métricas raw completas |
| `08_report.html` | f084 | Informe HTML |
| `outputs.yaml` | f084 | Artefacto canónico con exports + metrics |

---

## 10. Diferencias clave respecto a F07

| Aspecto | F07 (f07_modval) | F08 (f08_sysval) |
|---|---|---|
| Modelos | 1 único modelo TFLite | N modelos TFLite simultáneos |
| Padres | 1 padre F06 | N padres F07 (uno por modelo) |
| Scripts | f071, f072, f073 | f081, f082, f083, f084 |
| Paso extra | No | f081_selectconfig (selección óptima) |
| Optimización | No aplica | MILP (Dinkelbach) para max_global_recall |
| Presupuesto temporal | Validación 1 modelo: itmax_ms | Multi-modelo: sum(effective_time_ms) ≤ MTI_MS |
| Arena | Por modelo individual | Arena global = max(arena_bytes por candidato) |
| Dataset de evaluación | 1 CSV por variante | Uno por cada modelo seleccionado (cruce por fingerprint) |
| Deduplicación | No | Ventanas únicas sobre unión de datasets de evaluación |
| Métricas de calidad | quality_score, TP/FP/FN individuales | Por modelo + agregados globales (global_recall, system_quality_score) |
| Artefacto de selección | No existe | `08_selected_configuration.yaml`, `08_candidate_summary.csv` |
| Archivo perfil | `07_model_profile.yaml` | `08_system_profile.yaml` |
| `system_viable` | `edge_capable AND run_completed` | `configuration_edge_capable AND system_viable AND esp_run_completed` |
