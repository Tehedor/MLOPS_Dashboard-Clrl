# Fase 7 — Model Validation (Edge) — Documentación completa

## Índice

1. [Visión general](#1-visión-general)
2. [Prerequisitos y dependencias de fases anteriores](#2-prerequisitos-y-dependencias-de-fases-anteriores)
3. [Script f071 — PrepareBuild](#3-script-f071--preparebuild)
4. [Script f072 — FlashRun](#4-script-f072--flashrun)
5. [Script f073 — Post (análisis)](#5-script-f073--post-análisis)
6. [Flujo completo de extremo a extremo](#6-flujo-completo-de-extremo-a-extremo)
7. [Cómo se compila y sube una aplicación C al ESP32](#7-cómo-se-compila-y-sube-una-aplicación-c-al-esp32)
8. [Archivos del template_project](#8-archivos-del-template_project)
9. [Archivos de template_project/main](#9-archivos-de-template_projectmain)

---

## 1. Visión general

La Fase 7 (`f07_modval`) es la **validación real en hardware del modelo cuantizado**. Toma como entrada el modelo `.tflite` generado en F06 (cuantización) y lo ejecuta literalmente en el microcontrolador ESP32, midiendo rendimiento temporal, consumo de memoria y calidad de predicción en condiciones reales de edge.

El nombre interno de la fase es `f07_modval` y genera sus artefactos en `executions/f07_modval/<variant>/`.

La fase se divide en tres scripts independientes que se ejecutan en secuencia:

```
f071_preparebuild.py  →  f072_flashrun.py  →  f073_post.py
      (prepare)              (build/flash/run)       (análisis)
```

Cada script puede invocarse por separado, lo que permite depurar o repetir etapas sin repetir todo el proceso.

---

## 2. Prerequisitos y dependencias de fases anteriores

Antes de poder ejecutar F07 es necesario que F06 haya completado correctamente y que su `outputs.yaml` contenga:

| Campo F06 | Uso en F07 |
|---|---|
| `edge_capable: true` | Precondición hard: si es `false`, F07 aborta |
| `model_tflite` (artifact path) | Fichero binario del modelo |
| `calibration_dataset` (artifact path) | Dataset para enviar al ESP32 |
| `arena_estimated_bytes` | Tamaño del tensor arena de TFLM |
| `operators` | Lista de operadores TFLite para el resolver |
| `input_dtype`, `output_dtype` | Deben ser `int8`/`uint8` |
| `input_bytes`, `output_bytes`, `input_shape`, `output_shape` | Firma del tensor |
| `Tu`, `OW`, `LT`, `PW` | Parámetros temporales de la ventana deslizante |
| `event_type_count` | Número de tipos de evento (≤ 256) |
| `prediction_name`, `runtime_model_name` | Nombres del modelo |
| `decision_threshold` | Umbral de clasificación binaria |
| `model_size_bytes` | Tamaño del `.tflite` para verificación de integridad |

Los parámetros propios de la variante F07 (definidos en `params.yaml` de la variant) son:

- `MTI_MS`: Tiempo máximo de inferencia en milisegundos.
- `ITmax`: Límite absoluto de latencia (opcional, se infiere de `MTI_MS`).
- `time_scale_factor`: Factor de escala para convertir unidades Tu a milisegundos.
- `platform`: Plataforma objetivo (`esp32`).
- `max_rows`: Máximo de filas del dataset a usar (opcional).

---

## 3. Script f071 — PrepareBuild

**Fichero:** `scripts/phases/f071_preparebuild.py`  
**Propósito:** Preparar el proyecto de compilación C/C++ con todos los artefactos generados específicos del modelo.

### Qué hace, paso a paso

#### 3.1 Validación y carga de metadatos
1. Carga `params.yaml` de la variante para obtener parámetros propios de F07.
2. Carga `outputs.yaml` de la variante padre F06.
3. Verifica que `edge_capable == true`; si no, lanza excepción.
4. Verifica tipos de tensor (`int8`/`uint8`), `input_bytes`, `output_bytes`, `arena_bytes`.
5. Calcula la unión de operadores (`compute_union_operators`) para soportar multi-modelo.
6. Calcula `arena_global = arena_bytes * 1.15 + 1024` (margen de seguridad global).
7. Resuelve `mti_ms` (con fallback legacy a unidades Tu) e `ITmax`.

#### 3.2 Creación del proyecto de plataforma
Determina el directorio de plantilla del proyecto según la plataforma (`edge/esp32/template_project`) y lo copia íntegro en `executions/f07_modval/<variant>/esp32_project/`.

De forma análoga copia el directorio de runner (`edge/esp32/runner`) a `esp32_runner/` si existe.

#### 3.3 Generación de artefactos en `build_generated/`
Dentro del proyecto copiado se crea `build_generated/` con tres ficheros generados automáticamente:

**`models_data.c`** — Serialización del modelo como array C. Contiene los bytes del `.tflite` incrustados directamente en el binario y la estructura `model_t` con los metadatos (nombre, umbral, arena, exec_time…). Se genera con `tflites_to_models_data_c()`.

**`model_resolver.h`** — Header que registra únicamente los operadores TFLite presentes en el modelo. Se genera con `generate_tflm_resolver()`. Esto minimiza el tamaño del binario: solo se incluye en el resolver el subconjunto de operadores necesarios.

**`config.h`** — Parámetros de configuración en tiempo de compilación: `TUNIT_MS`, `OW_MS`, `MIT_MS`, `USE_SERIAL_READER`. Se genera con `generate_runtime_config()`.

**`memory_events.h`** — Para el modo memoria: incrusta el dataset completo como arrays C estáticos. Solo se genera cuando `USE_SERIAL_READER == 0`.

#### 3.4 Preparación del dataset
- Copia y convierte el dataset de calibración de F06 a CSV semicolon-separated (`07_input_dataset.csv`).
- Genera también `07_evaluation_dataset.csv` para el análisis posterior de F073.

#### 3.5 Ficheros de configuración de la ejecución
Genera dos YAML en la carpeta de la variante:

**`07_edge_run_config.yaml`** — Contiene toda la configuración necesaria para f072: plataforma, directorio del proyecto, geometría temporal (Tu, OW, LT, PW), parámetros de drenado, memoria, modelos, operadores, límites. Es la "fuente de verdad" que f072 lee.

**`07_model_profile.yaml`** — Perfil inicial del modelo (pre-ejecución). Contiene compatibilidad, firma de entrada, parámetros de build y límites. Se completará en f073 con los resultados de la ejecución real.

---

## 4. Script f072 — FlashRun

**Fichero:** `scripts/phases/f072_flashrun.py`  
**Propósito:** Compilar el proyecto C con Docker + ESP-IDF, flashear el ESP32 y capturar la salida serie durante la ejecución.

### Flags de línea de comandos

| Flag | Descripción |
|---|---|
| `--variant` | Identificador de la variante (requerido) |
| `--mode serial\|memory` | Serial: envía datos por UART. Memory: solo monitoriza (datos incrustados en flash) |
| `--port` | Puerto serie (ej. `/dev/ttyUSB0`). Autodetección si no se especifica |
| `--baud` | Velocidad UART (defecto: 115200) |
| `--drain-seconds` | Tiempo de espera tras enviar el último dato |
| `--build-only` | Solo compila, no flashea ni ejecuta |
| `--no-clean-build` | No borra `build/` antes de compilar (build incremental) |
| `--skip-build` | Usa el build existente sin recompilar |
| `--skip-flash` | Omite el flasheo (usado para QEMU virtual) |

### Fases internas de ejecución

#### 4.1 Carga de configuración
Lee `07_edge_run_config.yaml`, determina la plataforma y los directorios del proyecto. Calcula `post_wait_s` (tiempo de drenado tras el envío del último dato), garantizando que sea al menos `OW * Tu_ms + MTI_MS`.

#### 4.2 Detección de puerto serie
Si no se especifica `--port`, llama a `auto_detect_port()`:
- Si hay exactamente un puerto USB, lo usa automáticamente.
- Si hay múltiples puertos, fuerza al usuario a especificar con `--port`.
- Si no hay ninguno, lanza error claro con diagnóstico.

La detección prioriza puertos con VID/PID USB reales sobre puertos virtuales.

#### 4.3 BUILD — Compilación con Docker
Solo para ESP32. Para otras plataformas delega en scripts `build.sh` del runner.

1. **Limpia** `build/` (salvo `--no-clean-build` o `--skip-build`).
2. **Sincroniza** `build_generated/` a `build/build_generated/` (los artefactos generados por f071 deben estar en el `CMAKE_BINARY_DIR` que CMake usa).
3. **Sanea** `sdkconfig` copiando desde `sdkconfig.defaults` (evita incompatibilidades entre entornos Docker y host).
4. **Valida** que la imagen Docker `mlops4ofp-idf:6.0` existe localmente; si no, la construye automáticamente con `edge/esp32/docker/build_image.sh`.
5. **Ejecuta** `idf.py build` dentro del contenedor Docker montando el directorio del proyecto como volumen. El contenedor corre con UID/GID del host para que los artefactos generados tengan el ownership correcto.

El comando Docker construido tiene esta forma:
```
docker run --rm -i \
  -e HOST_UID=<uid> -e HOST_GID=<gid> \
  -v <esp_project_dir>:/project -w /project \
  --entrypoint /bin/bash \
  mlops4ofp-idf:6.0 -lc \
  "source /opt/esp/idf/export.sh && idf.py build; rc=$?; chown -R ... /project/build ...; exit $rc"
```

El `chown` al final es fundamental: idf.py genera muchos ficheros como root dentro del contenedor y sin ese paso el directorio `build/` quedaría con ownership incorrecto en el host.

#### 4.4 FLASH — Volcado al hardware

El flash es portable: funciona de diferente forma según el entorno.

- **macOS**: usa siempre `esptool` en host (sin Docker, porque macOS no permite pasar dispositivos serie a Docker de forma fiable).
- **Linux con Docker y passthrough USB disponible**: usa `idf.py flash` dentro del contenedor con `--device /dev/ttyUSBx:/dev/ttyUSBx`.
- **Linux sin passthrough**: usa `esptool` en host como fallback.

El flash tiene sistema de reintentos (`flash_with_retry`, hasta 3 intentos) que distingue fallos de conexión serie (reseteos, puertos ocupados, sincronización fallida) de errores de compilación.

Para QEMU virtual, `--skip-flash` omite este paso completamente.

#### 4.5 RUN — Envío de datos y captura

**Modo `serial`** (`serial_send_and_monitor`):
1. Espera 8 segundos tras el flash para que el ESP32 arranque.
2. Abre el puerto serie en modo no-bloqueante (`timeout=0`).
3. Lee todas las líneas del CSV de entrada (`07_input_dataset.csv`).
4. Envía cada línea por UART exactamente cada `Tu_ms` milisegundos, sincronizado con `time.monotonic()`.
5. Entre envíos lee y guarda en log todo lo que el ESP32 emite por UART.
6. Tras enviar la última línea, espera `post_wait_s` segundos drenando el buffer (tiempo para que el ESP32 procese la última ventana OW + realice la inferencia final).
7. Guarda la captura completa en `07_esp_monitor_log.txt`.

**Modo `memory`** (`serial_monitor_only`):
Solo monitoriza el puerto serie durante `post_wait_s` segundos. Los datos de entrada ya están en el flash (incrustados en `memory_events.h`).

---

## 5. Script f073 — Post (análisis)

**Fichero:** `scripts/phases/f073_post.py`  
**Propósito:** Parsear el log de monitorización del ESP32, calcular métricas de rendimiento y calidad, y escribir `outputs.yaml` que consumirá F08.

### Flags de línea de comandos

| Flag | Descripción |
|---|---|
| `--variant` | Identificador de la variante (requerido) |
| `--parent` | Variante padre F06 (opcional, se autodetecta desde `params.yaml`) |
| `--fp_index` | Ruta a CSV de índice de fingerprints para métricas supervisadas |

### Fases internas

#### 5.1 Gestión de casos sin log
Si no existe `07_esp_monitor_log.txt`, exporta un `outputs.yaml` parcial con `edge_run_completed: false` y razón `monitor_log_missing`. Esto permite que el pipeline continúe hacia F08 aunque la ejecución no se completara.

#### 5.2 Parsing del log
Llama a `parse_log_enriched()` del módulo `scripts.runtime_analysis.parse`. Este parser lee línea a línea el log del ESP32 que tiene el formato:

```
<ts_us>,<event_id>,<model_id>,<tu_us>,<a>,<b>,<c>
```

Donde cada línea es un evento emitido por la macro `TRACE_EMIT` o `TRACE_FUNC_*` del firmware.

El parser distingue:
- **Eventos funcionales** (`FUNC_PRED_RESULT`, `FUNC_OFFLOAD_RESULT`, `FUNC_URGENT_RESULT`): resultado final de cada ciclo de predicción.
- **Eventos de instrumentación** (`INST_*`): información temporal detallada del ciclo de scheduling e inferencia.

#### 5.3 Métricas de modelo
`compute_model_metrics(df)` calcula por modelo:
- `n_attempts`: total de intentos de inferencia.
- `n_ok`: inferencias completadas dentro del deadline.
- `n_wd_late`, `n_wd_early`, `n_inference_incomplete`: tipos de fallo de watchdog.
- `n_offload`, `n_urgent`, `n_no_inference`: otros tipos de degradación.
- `infer_mean_ms`, `infer_max_ms`, `infer_jitter_ms`: estadísticas de latencia.
- Tasas derivadas (`ok_rate`, `fail_rate`, `offload_rate`…).

#### 5.4 Métricas de predicción (supervisadas)
Si hay un índice de fingerprints disponible, calcula métricas supervisadas de clasificación binaria:
- TP, FP, TN, FN
- Accuracy, Precision, Recall, F1
- False Negative Rate

El índice de fingerprints se resuelve por prioridad:
1. `--fp_index` explícito.
2. Construcción automática desde `07_input_dataset.csv` usando el mismo hash FNV-1a 32-bit que usa el firmware (`events_mgr_fingerprint`).
3. Ficheros `fp_index.csv` / `07_fp_index.csv` en la carpeta de variante o en F06.
4. Plantilla vacía `fp_index_template.csv` para que el usuario la complete.

#### 5.5 Métricas de memoria y timing de sistema
- `compute_memory_summary(df)`: extrae pico de heap usado, heap mínimo registrado.
- `compute_system_summary(df)`: tiempo de procesamiento total por Tu, jitter del ciclo.

#### 5.6 Actualización del perfil del modelo
Actualiza `07_model_profile.yaml` (creado por f071) añadiendo los bloques `run`, `timing`, `memory`, `quality` y `outcomes` con los resultados reales de la ejecución edge.

#### 5.7 Escritura de outputs.yaml
Genera el `outputs.yaml` final con:
- `exports`: métricas clave propagables a F08 (`quality_score`, `ok_rate`, `offload_rate`, `edge_run_completed`…).
- `artifacts`: rutas a los CSV de métricas y al perfil del modelo.
- `phase_status_reason`: `completed`, `monitor_log_missing`, `edge_run_not_completed` o `configuration_edge_capable_false`.

---

## 6. Flujo completo de extremo a extremo

```
╔══════════════════════════════════════════════════════════════════════════╗
║  F06 outputs.yaml (modelo cuantizado, edge_capable=true)                ║
╚══════════════════════════════════════════════════════════════════════════╝
                               │
                               ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║  f071_preparebuild.py --variant <v>                                       ║
║                                                                           ║
║  1. Valida requisitos F06 (edge_capable, dtypes, arena, operators)        ║
║  2. Copia template_project → esp32_project/                               ║
║  3. Genera build_generated/                                               ║
║     ├── models_data.c     (modelo .tflite incrustado como bytes C)        ║
║     ├── model_resolver.h  (solo los operators del modelo)                 ║
║     ├── config.h          (TUNIT_MS, OW_MS, MIT_MS, USE_SERIAL_READER)   ║
║     └── memory_events.h   (dataset incrustado, si mode=memory)           ║
║  4. Genera 07_input_dataset.csv  (datos a enviar por UART)                ║
║  5. Genera 07_edge_run_config.yaml (config completa para f072)            ║
║  6. Genera 07_model_profile.yaml  (perfil inicial, pre-ejecución)         ║
╚═══════════════════════════════════════════════════════════════════════════╝
                               │
                               ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║  f072_flashrun.py --variant <v> [--port /dev/ttyUSBx]                    ║
║                                                                           ║
║  BUILD:                                                                   ║
║  1. Sincroniza build_generated/ → build/build_generated/                  ║
║  2. Sanea sdkconfig desde sdkconfig.defaults                              ║
║  3. Verifica imagen Docker mlops4ofp-idf:6.0 (crea si no existe)         ║
║  4. idf.py build en Docker → genera esp32_project/build/                  ║
║     └── MLOps4OFP.bin  (binario flasheable)                               ║
║                                                                           ║
║  FLASH:                                                                   ║
║  5. esptool / idf.py flash → escribe binario en ESP32 (con reintentos)   ║
║                                                                           ║
║  RUN:                                                                     ║
║  6. Espera 8s arranque ESP32                                              ║
║  7. Envía CSV línea a línea por UART cada Tu_ms                           ║
║  8. Lee y guarda respuestas TRACE_* hasta post_wait_s                     ║
║  9. Guarda 07_esp_monitor_log.txt                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝
                               │
                               ▼
╔═══════════════════════════════════════════════════════════════════════════╗
║  f073_post.py --variant <v>                                               ║
║                                                                           ║
║  1. Parsea 07_esp_monitor_log.txt (eventos TRACE)                         ║
║  2. Calcula métricas de modelo (latencia, watchdogs, ok_rate…)            ║
║  3. Calcula métricas de predicción supervisada (TP/FP/TN/FN, F1…)        ║
║  4. Calcula métricas de memoria y timing de sistema                       ║
║  5. Actualiza 07_model_profile.yaml (bloques run/timing/memory/quality)   ║
║  6. Escribe metrics_models.csv, metrics_memory.csv, metrics_system.csv   ║
║  7. Escribe outputs.yaml (para F08)                                       ║
╚═══════════════════════════════════════════════════════════════════════════╝
                               │
                               ▼
                    F08 consume outputs.yaml
```

---

## 7. Cómo se compila y sube una aplicación C al ESP32

### 7.1 El toolchain: ESP-IDF en Docker

El proyecto ESP32 se compila con el SDK oficial de Espressif, **ESP-IDF** (IoT Development Framework). Para garantizar reproducibilidad en diferentes entornos (Linux, macOS, CI), la compilación se ejecuta dentro de un contenedor Docker con la imagen `mlops4ofp-idf:6.0` que tiene ESP-IDF preinstalado en `/opt/esp/idf`.

La imagen se construye con `edge/esp32/docker/build_image.sh` y contiene:
- GCC Xtensa toolchain
- CMake + Ninja
- ESP-IDF con todos sus componentes
- Librerías del componente `esp-tflite-micro` (TensorFlow Lite Micro para ESP32)

### 7.2 Sistema de build: CMake + idf.py

ESP-IDF usa CMake como sistema de build, pero lo envuelve con `idf.py` (Python) que maneja la configuración del target, el sistema de componentes y la generación del binario flasheable.

La jerarquía de CMakeLists.txt es:
```
template_project/
├── CMakeLists.txt       ← raíz del proyecto (project())
└── main/
    └── CMakeLists.txt   ← componente principal (idf_component_register)
```

El `CMakeLists.txt` raíz:
1. Define `GENERATED_DIR = ${CMAKE_SOURCE_DIR}/build_generated` y lo añade a include paths si existe.
2. Incluye el sistema de CMake de ESP-IDF.
3. Define el nombre del proyecto: `MLOps4OFP`.

El `main/CMakeLists.txt`:
1. Registra todos los ficheros `.c` / `.cpp` del componente.
2. Añade `${CMAKE_BINARY_DIR}/build_generated/models_data.c` como fuente generada.
3. Incluye `${CMAKE_BINARY_DIR}/build_generated` en los include paths (donde están `config.h`, `model_resolver.h`, `memory_events.h`).
4. Declara dependencias ESP-IDF: `freertos`, `driver`, `esp_driver_uart`, `esp-tflite-micro`, `esp_timer`.
5. Si se define `ENABLE_TRACES` en CMake, activa la macro de instrumentación.

### 7.3 Proceso de compilación paso a paso

```
idf.py build
    │
    ├── 1. CMake configure
    │      └── Genera build system (Ninja/Make) a partir de CMakeLists.txt
    │
    ├── 2. Compilación de fuentes
    │      ├── Compila todos los .c con arm-none-eabi-gcc Xtensa
    │      ├── Compila tflite_runner.cpp con g++ Xtensa  
    │      └── Descarga y compila componente esp-tflite-micro (si no está en caché)
    │
    ├── 3. Linkado
    │      └── Genera ELF con todas las secciones (código, datos, rodata)
    │
    └── 4. Generación de binarios flasheables
           ├── build/MLOps4OFP.bin        (aplicación)
           ├── build/bootloader/bootloader.bin
           ├── build/partition_table/partition-table.bin
           └── build/flash_args           (offsets y flags para esptool)
```

El modelo TFLite se compila dentro de `models_data.c` como array `const unsigned char[]` en la sección de datos de solo lectura (`.rodata`), lo que lo coloca en flash en lugar de RAM.

### 7.4 Flasheo: esptool.py

Una vez compilado, el binario se sube al ESP32 con `esptool.py`. El fichero `build/flash_args` contiene los argumentos exactos: offsets de memoria para cada partición y flags de comunicación.

```bash
esptool.py \
  --chip esp32 \
  -p /dev/ttyUSB0 \
  -b 460800 \
  --before default-reset \
  --after hard-reset \
  write-flash \
  @flash_args
```

El flag `@flash_args` expande el contenido del fichero con los offsets de cada segmento:
- `0x1000` → bootloader
- `0x8000` → partition table
- `0x10000` → aplicación

### 7.5 Verificación de ownership en Docker

Como Docker corre como root, todos los ficheros generados en el volumen montado (`/project/build`) quedarían con owner `root:root`. El comando Shell del contenedor incluye siempre al final:

```bash
chown -R "$HOST_UID:$HOST_GID" /project/build /project/build_generated /project/sdkconfig ...
```

Esto garantiza que el usuario del host pueda leer y modificar los artefactos generados sin sudo.

### 7.6 Flujo para ESP32 virtual (QEMU)

Para el modo de desarrollo/testing sin hardware físico, existe un entorno QEMU basado en el fork de Espressif de QEMU con soporte Xtensa:

1. Se construye una imagen flash unificada (`merged_flash.bin`) que combina bootloader + partition table + aplicación en los offsets correctos.
2. Se levanta un par socat+QEMU: socat crea un puerto serie virtual en `/tmp/ttyVUSB0` y lo conecta a QEMU.
3. Se usa `--skip-flash` en f072 (QEMU arranca directamente desde la imagen) y `--port /tmp/ttyVUSB0`.

---

## 8. Archivos del template_project

### `CMakeLists.txt` (raíz)

Define el proyecto CMake de ESP-IDF para la aplicación MLOps4OFP. Su responsabilidad principal es gestionar la ruta de artefactos generados por f071:

- Define `GENERATED_DIR = ${CMAKE_SOURCE_DIR}/build_generated`.
- Si ese directorio existe, lo añade al include path global (para que los `.c` de `main/` puedan hacer `#include "config.h"` directamente). Si no existe emite un warning pero no falla, permitiendo compilar sin variante específica durante desarrollo.
- Incluye la maquinaria CMake de ESP-IDF (`$ENV{IDF_PATH}/tools/cmake/project.cmake`).
- Declara el nombre del proyecto: `MLOps4OFP`.

### `sdkconfig.defaults`

Configuración mínima del kernel FreeRTOS y del driver de timers que se aplica antes de cualquier compilación. Tiene dos líneas clave:

```
CONFIG_FREERTOS_HZ=1000
CONFIG_ESP_TIMER_SUPPORTS_ISR_DISPATCH_METHOD=y
```

- `CONFIG_FREERTOS_HZ=1000`: Configura el tick rate de FreeRTOS a 1 ms (1000 Hz). Esto es crítico porque el scheduler usa `pdMS_TO_TICKS()` para convertir tiempos en milisegundos a ticks, y con 1000 Hz cada tick es exactamente 1 ms, lo que hace las conversiones exactas sin error de cuantización. El firmware usa `vTaskDelayUntil(&last_wake, pdMS_TO_TICKS(TUNIT_MS))` para temporizar el ciclo principal.

- `CONFIG_ESP_TIMER_SUPPORTS_ISR_DISPATCH_METHOD=y`: Habilita la opción de ejecutar callbacks de `esp_timer` directamente desde ISR (Interrupt Service Routine) sin pasar por la cola de tareas. El firmware usa timers ISR para los callbacks de start_timer y deadline_timer en `predictions_mgr.c`, lo que reduce la latencia del watchdog de inferencia.

f072 **regenera** `sdkconfig` copiando desde este fichero antes de cada build Docker. Esto evita que un `sdkconfig` previo (generado en una arquitectura diferente o con otra versión de IDF) cause incompatibilidades.

### `dependencies.lock`

Fichero de lock del gestor de componentes de ESP-IDF (`idf_component_manager`). Registra las versiones exactas de los componentes descargados, principalmente `espressif/esp-tflite-micro`. Se genera automáticamente en la primera compilación. Su presencia asegura reproducibilidad de builds: sin este fichero el gestor descargaría la última versión compatible, que podría diferir entre entornos.

f072 incluye este fichero en la lista de `chown` para que el ownership sea correcto tras la primera compilación en Docker.

---

## 9. Archivos de template_project/main

### `CMakeLists.txt` (main)

Punto de entrada del sistema de componentes de ESP-IDF para la aplicación. Registra explícitamente:

**Fuentes compiladas** (`SRCS`):
Todos los `.c` y `.cpp` del componente main más `build_generated/models_data.c` que se encuentra bajo `${CMAKE_BINARY_DIR}` (el directorio `build/`). Es importante que esta ruta sea `${CMAKE_BINARY_DIR}/build_generated/models_data.c` y no relativa, porque f072 copia `build_generated/` dentro de `build/` (no en el source tree).

**Include paths** (`INCLUDE_DIRS`):
- `.`: el propio directorio `main/` para los headers locales.
- `${CMAKE_BINARY_DIR}`: para acceder a cualquier fichero en `build/`.
- `${CMAKE_BINARY_DIR}/build_generated`: para `config.h`, `model_resolver.h`, `memory_events.h`.

**Dependencias ESP-IDF** (`REQUIRES`):
- `freertos`: API de tareas, colas, timers, semáforos.
- `driver`: drivers hardware genéricos.
- `esp_driver_uart`: driver UART0 para comunicación serie.
- `esp-tflite-micro`: TensorFlow Lite Micro compilado como componente ESP-IDF.
- `esp_timer`: timers de alta precisión en microsegundos.

Si `ENABLE_TRACES` está definido en CMake, activa `add_compile_definitions(ENABLE_TRACES)` que habilita las macros `TRACE_INST` en todo el build.

---

### `main.c`

Punto de entrada de la aplicación FreeRTOS (`app_main`). Implementa el **bucle principal del sistema** que coordina todos los módulos.

**Secuencia de inicialización:**
1. `trace_init(115200)`: inicializa UART0 para telemetría.
2. `models_mgr_init()`: imprime metadatos de los modelos cargados.
3. `count_models_that_fit()`: validación preflight — verifica que todos los modelos caben en el arena de TFLM.
4. `tflite_runner_init(g_models, g_models_count)`: aloca el arena compartido y valida cada modelo contra él.
5. `events_mgr_create()`: crea el gestor de ventana deslizante de eventos.
6. `vTaskPrioritySet(NULL, PRIORITY_MAIN)`: eleva la prioridad de la tarea principal a 24 (por encima de la mayoría de tareas del sistema).
7. `prediction_mgr_init(mgr)`: crea las tareas FreeRTOS `pred_mgr` y `pred_worker` y los timers de scheduling.

**Emisión de referencia de heap:**
Antes del primer ciclo Tu, emite 3 veces la medición de heap total/libre/mínimo con `TRACE_INST(INST_SYS_P0_MEM_TOTAL_REF, ...)`. Esto establece una línea base para detectar memory leaks durante la ejecución. Espera 500 ms antes de emitir para garantizar que el monitor serie ya está enganchado.

**Bucle principal (ciclo Tu):**
```
loop:
  vTaskDelayUntil(TUNIT_MS)          ← sincronización temporal
  ts_tu = esp_timer_get_time()        ← timestamp µs
  TRACE_INST(TU_WAKE)
  read_events(events, MAX_EVENTS)     ← lee datos de UART o memoria
  events_mgr_add(mgr, ts_tu, events) ← almacena en ventana deslizante
  stored = events_mgr_get_at(ts_tu)  ← recupera los eventos de este Tu
  activated = models_mgr_get_models_for_events(stored)  ← activa modelos
  scheduler_schedule(activated, ts_tu, &result)          ← planifica
  for rejected: TRACE_FUNC_OFFLOAD                       ← reporta rechazados
  prediction_mgr_start(result.accepted)                  ← lanza inferencias
```

El bucle usa `vTaskDelayUntil` (no `vTaskDelay`) para que la temporización sea absoluta y acumulativa, sin deriva temporal a lo largo de miles de iteraciones.

---

### `scheduler.c` / `scheduler.h`

Planificador de tiempo real para las inferencias. Dado un conjunto de modelos a ejecutar y el timestamp actual, decide cuáles se pueden ejecutar dentro de la ventana de tiempo y cuáles se rechazan (offload).

**Algoritmo (EDF simplificado):**
Para cada modelo en orden:
1. Calcula `slot_start`: el primer instante disponible (máximo entre `last_used_time` y `event_time + OW_MS`).
2. Calcula `deadline = slot_start + exec_time`.
3. Si `deadline <= window_end` (= `event_time + OW_MS + MIT_MS`): acepta el modelo, avanza `current_time` al deadline.
4. Si no: rechaza (OFFLOAD).

Los buffers de resultado (`acc_buf`, `rej_buf`) son arrays estáticos de `MAX_MODELS` elementos, sin allocación dinámica, para cumplir con los requisitos de tiempo real.

`last_used_time` es estático y persiste entre invocaciones del scheduler, evitando solapamiento entre ciclos Tu consecutivos.

---

### `events_mgr.c` / `events_mgr.h`

Gestor de la ventana deslizante de eventos. Implementa una **lista enlazada** de entradas, donde cada entrada es un timestamp + array de eventos recibidos en ese Tu.

**API principal:**
- `events_mgr_create()`: aloca el gestor.
- `events_mgr_add(mgr, time, data, length)`: añade una entrada nueva y llama automáticamente a `cleanup`.
- `events_mgr_get_at(mgr, time, &length)`: devuelve copia de los eventos del Tu exacto indicado.
- `events_mgr_get_range(mgr, start, end, &length)`: devuelve todos los eventos en un rango temporal.
- `events_mgr_cleanup(mgr, now)`: expulsa entradas más antiguas que `now - 2*OW_MS` para liberar memoria.
- `events_mgr_fingerprint(events, n)`: calcula hash FNV-1a 32-bit del array de eventos.

**Hash FNV-1a:**
```c
h = FNV_OFFSET_BASIS (2166136261u)
for each event:
    h ^= (uint8_t)event
    h *= FNV_PRIME (16777619u)
```

Este mismo algoritmo se replica en Python en `window_fingerprint.py` para poder construir el índice de fingerprints en f073 y comparar predicciones del ESP32 con labels conocidos.

---

### `models_mgr.c` / `models_mgr.h`

Gestiona el registro de modelos disponibles en el dispositivo. Los modelos se almacenan en `g_models[]` (array const de `model_t`, definido en `models_data.c` generado).

**Estructura `model_t`:**
```c
typedef struct {
    const char          *name;          // Nombre del modelo
    const unsigned char *data;          // Puntero al array de bytes del .tflite
    size_t               size;          // Tamaño en bytes
    uint64_t             exec_time;     // Tiempo máximo de inferencia (µs)
    float                threshold;     // Umbral de decisión binaria
    size_t               arena_required;// Bytes de arena TFLM necesarios
    const event_t       *triggers;      // Tipos de evento que activan el modelo
    size_t               trigger_count; // Número de triggers
    bool                 trigger_all;   // Si true, se activa con cualquier evento
} model_t;
```

**`models_mgr_get_models_for_events`**: función de activación de modelos. Determina qué modelos correr dado el conjunto de eventos recibidos en el Tu actual. Si `trigger_all == true` el modelo se activa siempre. En caso contrario solo se activa si el primer evento del Tu coincide con algún trigger del modelo.

**`models_mgr_index_of`**: devuelve el índice de un modelo por puntero, necesario para emitir eventos TRACE con `model_id`.

---

### `predictions_mgr.c` / `predictions_mgr.h`

Corazón de la ejecución de inferencias en tiempo real. Implementa un sistema de dos tareas FreeRTOS con timers de deadline para ejecutar inferencias con control de watchdog.

**Arquitectura de tareas:**
```
app_main  →  prediction_mgr_start()
                   │
                   ▼
         s_batch_queue (QueueHandle_t)
                   │
                   ▼
         manager_task (Core 0, max_priority-1)
         ├── Para cada slot de la batch:
         │   ├── Calcula delay hasta start_time
         │   ├── Arma start_timer y deadline_timer
         │   ├── Espera BIT_START o BIT_DEADLINE
         │   ├── Si BIT_DEADLINE antes de START → URGENT (inferencia saltada)
         │   ├── Si BIT_START → notifica worker_task
         │   └── Espera BIT_DONE o BIT_DEADLINE
         │       ├── Si BIT_DEADLINE → mata y recrea worker_task → URGENT
         │       └── Si BIT_DONE → para deadline_timer, emite FUNC_PRED_RESULT
         └──  worker_task (Core 1, max_priority-2)
              └── Llama tflite_runner_run() y notifica BIT_DONE
```

Los timers `start_timer` y `deadline_timer` se configuran con `ESP_TIMER_ISR` para dispararse desde ISR, minimizando la latencia del watchdog. El `deadline_timer` actúa como **watchdog hardware**: si la inferencia no termina antes del deadline, el manager_task interrumpe el worker_task recreándolo.

El fingerprint de la ventana de eventos se calcula antes de la batch con `events_mgr_fingerprint()` y se emite junto al resultado de cada inferencia en `TRACE_FUNC_PRED(model_id, tu, fingerprint, result)`.

---

### `tflite_runner.cpp` / `tflite_runner.h`

Interfaz C++ con TensorFlow Lite Micro. Es el único fichero `.cpp` del proyecto (TFLM requiere C++).

**Estado global:**
- `s_arena`: buffer de bytes alocado una vez, reutilizado entre todas las inferencias. Tamaño = máximo `arena_required` entre todos los modelos.
- `s_resolver`: instancia única de `MicroMutableOpResolver` con los operadores registrados por `SetupModelResolver()` (función definida en el `model_resolver.h` generado por f071).
- `s_interpreter_storage`: memoria estática alineada para colocar el `MicroInterpreter` con placement new, evitando fragmentación del heap.

**`tflite_runner_init(models, count)`:**
1. Aloca el arena con `malloc`.
2. Crea el resolver y llama `SetupModelResolver`.
3. Para cada modelo ejecuta `validate_model_once()` que construye un interpreter temporal y verifica que `AllocateTensors()` funciona, los tipos de tensor son correctos y los tamaños son válidos. Si falla, `abort()`.

**`tflite_runner_run(model, input_data, input_len, result, output_len)`:**
1. Destruye el interpreter previo (llamando al destructor explícito, no `delete`).
2. Limpia el arena con `memset(s_arena, 0, s_arena_size)`.
3. Construye nuevo `MicroInterpreter` con placement new sobre `s_interpreter_storage`.
4. Copia los datos de entrada al tensor de input (con conversión de tipos si es necesario).
5. Invoca `Invoke()`.
6. Lee el valor cuantizado del output: `prob = (quantized_value - zero_point) * scale`.
7. Aplica umbral: `*result = (prob > model->threshold) ? 1 : 0`.

El uso de placement new sobre storage estático es deliberado: evita `malloc`/`free` repetidos en el heap para el `MicroInterpreter`, que es un objeto grande y tiene requisitos de alineación. El arena se reutiliza completamente entre inferencias.

---

### `data_reader.c` / `data_reader.h`

Abstracción del origen de datos: serie (UART) o memoria (array estático). La selección se hace en tiempo de compilación con la macro `USE_SERIAL_READER` definida en `config.h`.

**Modo serial (`USE_SERIAL_READER == 1`):**
- `read_events()` llama a `uart_read_bytes(UART_NUM_0, buf, sizeof(buf)-1, pdMS_TO_TICKS(10))`.
- Parsea la línea recibida como valores enteros separados por comas.
- Retorna el número de eventos leídos.
- El timeout de 10 ms es deliberadamente corto (polling): el bucle main llama a `read_events` cada Tu_ms, así que no necesita bloquear esperando datos.

**Modo memoria (`USE_SERIAL_READER == 0`):**
- `read_events()` lee del array estático `memory_events[_mem_index][]` definido en `memory_events.h`.
- Incrementa `_mem_index` cada llamada.
- Cuando se agotan las filas, retorna 0 (el bucle main hace `continue` y no procesa más eventos).

---

### `trace.c` / `trace.h`

Sistema de telemetría del firmware. Toda la información que f073 analiza viene de las emisiones de este módulo.

**Formato de línea emitida:**
```
<ts_us>,<event_id>,<model_id>,<tu_us>,<a>,<b>,<c>\n
```

- `ts_us`: timestamp absoluto en microsegundos desde `esp_timer_get_time()`.
- `event_id`: valor del enum `trace_event_t` (uint32).
- `model_id`: identificador del modelo (-1 para eventos de sistema).
- `tu_us`: timestamp del Tu al que pertenece el evento.
- `a,b,c`: payload dependiente del tipo de evento (heap_free, fingerprint, latencia...).

**Eventos funcionales** (siempre activos, no conmutables):
- `TRACE_FUNC_PRED(model, tu, fingerprint, value)`: resultado de una inferencia completada.
- `TRACE_FUNC_OFFLOAD(model, tu)`: modelo rechazado por el scheduler.
- `TRACE_FUNC_URGENT(model, tu, fingerprint)`: inferencia expirada por deadline.

**Eventos de instrumentación** (conmutables con `ENABLE_TRACES`):
- `TRACE_INST(event_id, model, tu, a, b, c)`: macro genérica usada para todos los puntos de instrumentación (`TU_WAKE`, `READ_EVENTS`, `SCHED_DECISION`, `INF_START`, `INF_END`, `MEM_*`...).

La emisión usa `uart_write_bytes()` que no bloquea si el buffer TX tiene espacio. Si no hay espacio (`uart_get_tx_buffer_free_size()` devuelve menos del necesario), el evento se descarta y se incrementa un contador de drops `trace_drops`. Esto garantiza que la telemetría nunca interfiere con la temporización del ciclo de inferencia.

---

### `models_data.h`

Header vacío que declara las variables externas `g_models[]` y `g_models_count` definidas en `models_data.c`. El fichero `.c` real es generado por f071 y contiene el array del modelo `.tflite` incrustado. Este header es la interfaz que el resto del código usa para acceder a los modelos sin depender del fichero generado directamente.

---

### `idf_component.yml`

Manifiesto del gestor de componentes de ESP-IDF. Declara:
- Versión mínima de ESP-IDF requerida: `>=4.1.0`.
- Dependencia de `espressif/esp-tflite-micro: '*'` (última versión compatible).

En la primera compilación, el gestor descarga `esp-tflite-micro` y sus dependencias transitivas (la versión de TensorFlow Lite Micro portada para ESP32 por Espressif). El resultado queda en `managed_components/` y la versión exacta se registra en `dependencies.lock`.
