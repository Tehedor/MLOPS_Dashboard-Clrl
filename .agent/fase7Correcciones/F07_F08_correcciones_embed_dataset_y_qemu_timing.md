# F07/F08 — Correcciones: EMBED_DATASET y timing QEMU

Fecha: 2026-06-14  
Contexto: diagnóstico de por qué f08 descartaba todos los candidatos y por qué las variantes v7_x00y no producían resultados válidos.

---

## Resumen de cambios

| Archivo | Cambio | Motivo |
|---------|--------|--------|
| `scripts/phases/f071_preparebuild.py` | `EMBED_DATASET = False → True` | Dataset no se embebía → 0 evaluaciones |
| `scripts/phases/f082_preparebuild.py` | `EMBED_DATASET = False → True` | Idem para fase 8 |
| `scripts/phases/f073_post.py` | No sobreescribir `timing.itmax_ms` en runs QEMU | Timer QEMU no fiable → valores inflados |
| `executions/f08_sysval/v8_0003/params.yaml` | `time_scale_factor: 1.0 → 0.01` | (cambio manual del usuario) f08 tardaba 12+ horas |

---

## Error 1 — `positive_support = 0` → f08 descarta todos los candidatos

### Causa raíz

`f081_selectconfig.py` filtra candidatos con `positive_support = tp + fn`. Si `positive_support == 0`, el modelo queda excluido antes de llegar al scheduler.

La cadena que llevaba a `positive_support = 0`:

```
EMBED_DATASET = False
       │
       ▼
generate_memory_events_header(..., max_rows=1)   ← solo 1 fila placeholder
       │
       ▼
memory_events_count = 1 en firmware
       │
       ▼
0 ventanas OW completas procesadas (OW=600, solo hay 1 fila)
       │
       ▼
N_total = 0, tp = 0, fn = 0
       │
       ▼
positive_support = 0 → candidato excluido en f08
```

El flag `EMBED_DATASET = False` estaba puesto como valor por defecto. Era correcto si el firmware usara modo serial (`USE_SERIAL_READER=1`), pero el firmware está compilado con `USE_SERIAL_READER=0` (modo memoria), así que sin filas en flash no hay nada que procesar.

### Fix aplicado

En `f071_preparebuild.py` y `f082_preparebuild.py`, línea ~8:
```python
# NOTE: con flash 2MB / partición app 1MB, máx seguro ≈ 10.000 filas (~56 bytes/fila compilado).
# max_rows=5000 (por defecto en params.yaml) → ~584KB binario, bien dentro del límite.
# Dataset completo (~35K filas) → ~2.2MB → overflow. NO embeber dataset completo.
EMBED_DATASET = True
```

La lógica que usa este flag (en ambos archivos):
```python
max_rows=max_rows if EMBED_DATASET else 1
```

Con `EMBED_DATASET=True`, pasa el `max_rows` de `params.yaml` (por defecto 5000). Con `False`, pasaba 1 (placeholder).

### Verificación de seguridad de flash

Con 5000 filas del dataset actual (~46 eventos/fila, ~56 bytes/fila compilado):

```
5000 × 56 = 280.000 bytes ≈ 280 KB datos
+ ~492 KB código/modelo/ROM
= ~584 KB binario total
< 1.024 KB (partición factory)  ✓ (43% libre)
```

Límite absoluto: **~10.000 filas** antes de overflow. Ver `F07_max_rows_y_flash_investigacion.md` para análisis detallado.

---

## Error 2 — `timing.itmax_ms` inflado por QEMU → f08 rechaza por tiempo

### El problema del doble reloj en QEMU

El ESP32 tiene dos timers distintos que en QEMU se desacoplan:

**Timer 1 — FreeRTOS tick** (confiable en QEMU):
- Configura en `sdkconfig.defaults`: `CONFIG_FREERTOS_HZ=1000`
- Controla `vTaskDelayUntil`, `pdMS_TO_TICKS()`, los periodos de Tu
- QEMU lo implementa como tick exacto del emulador
- Con `TUNIT_MS=100` (time_scale_factor=0.01 × Tu=10s × 1000), el firmware hace ciclos exactos de 100ms

**Timer 2 — `esp_timer_get_time()`** (NO confiable en QEMU):
- Cuenta ciclos de CPU del Xtensa emulado
- En QEMU la CPU virtual avanza a velocidad variable según carga del host
- Los timestamps en µs de `INST_MOD_P2_INF_START / INF_END` divergen del tick de FreeRTOS
- Ejemplo real: v7_3001 midió `infer_worst_ms = 3634ms` con `TUNIT_MS=100ms` — imposible en hardware real

`metrics_models.py` calcula:
```python
infer_max_ms = (INF_END_ts - INF_START_ts) / 1000  # µs → ms
```

Esa diferencia de timestamps usa `esp_timer_get_time()`, que es el timer no confiable.

f073 luego escribía ese valor en `timing.itmax_ms` del perfil del modelo. f081 usaba ese valor para planificar, y al ser 3634ms >> MTI_MS=100ms, f08 lo rechazaba.

### Fix aplicado en `f073_post.py`

**a) Parámetro añadido a `_update_model_profile()`:**
```python
def _update_model_profile(root, *, models_row, memory_row, system_row, time_scale_factor=1.0):
```

**b) Lógica condicional para `timing.itmax_ms`:**
```python
_raw_itmax = models_row.get("infer_worst_ms", models_row.get("infer_max_ms"))
# QEMU (time_scale_factor < 1): timing de esp_timer no fiable — no sobreescribir.
# f081 usará el fallback limits.itmax_ms (= ITmax del hardware spec).
# Hardware real (time_scale_factor == 1.0): medición fiable, usar valor medido.
if time_scale_factor < 1.0:
    _itmax_to_store = timing_block.get("itmax_ms")  # mantiene valor previo del perfil
else:
    _itmax_to_store = _raw_itmax
timing_block.update({
    "edge_mean_latency_ms": system_row.get("process_mean_ms", models_row.get("infer_mean_ms")),
    "edge_max_latency_ms": system_row.get("process_max_ms", models_row.get("infer_max_ms")),
    "edge_jitter_ms": system_row.get("process_jitter_ms", models_row.get("infer_jitter_ms")),
    "itmax_ms": _itmax_to_store,
})
```

**c) Lectura del factor en `run_analysis()`** (después de `resolved_parent = _resolve_parent_variant(...)`):
```python
_params_data = yaml.safe_load((root / "params.yaml").read_text()) if (root / "params.yaml").exists() else {}
_time_scale_factor = float((_params_data.get("parameters") or _params_data).get("time_scale_factor", 1.0))
```

**d) Llamada actualizada:**
```python
_update_model_profile(root, ..., time_scale_factor=_time_scale_factor)
```

### Cadena de fallback en f081

Con `timing.itmax_ms` sin sobreescribir (valor previo del perfil), f081 sigue la cadena:
```
timing.itmax_ms (si existe y es válido)
    → limits.itmax_ms       ← valor de params.yaml de f07: 100.0
        → limits.ITmax      ← idem
```

El perfil inicial generado por f071 ya incluye `limits.itmax_ms = ITmax = MTI_MS = 100ms`, así que el fallback da el valor correcto del hardware spec.

---

## Error 3 — f08 tardaba 12+ horas (corregido manualmente por el usuario)

### Causa

`v8_0003/params.yaml` tenía `time_scale_factor: 1.0`. El cálculo de timing en f083:
```
periodo_envío = Tu × time_scale_factor × 1000ms = 10s × 1.0 × 1000ms = 10s/línea
líneas a enviar = 4559 (del CSV de entrada)
tiempo envío = 4559 × 10s = 45.590s ≈ 12.7 horas
post_wait_s = (OW=600 + LT=100) × Tu_ms = 700 × 10s = 7.000s ≈ 1.9 horas
```

### Fix

El usuario cambió `time_scale_factor: 1.0 → 0.01` en `executions/f08_sysval/v8_0003/params.yaml`:
```
periodo_envío = 10s × 0.01 × 1000ms = 100ms/línea
tiempo envío = 4559 × 100ms = 456s ≈ 7.6 min
post_wait_s = 700 × 100ms = 70s
```

---

## Compatibilidad con versiones anteriores

Los cambios son **retrocompatibles** dentro del pipeline virtual QEMU:

| Escenario | Comportamiento |
|-----------|---------------|
| Run QEMU nuevo (time_scale_factor < 1) | f073 no toca `timing.itmax_ms` → f081 usa limits (correcto) |
| Run hardware real (time_scale_factor = 1.0) | f073 usa valor medido de esp_timer (correcto, timer fiable) |
| Variante sin time_scale_factor en params.yaml | Default 1.0 → comportamiento pre-cambio |
| max_rows > 10.000 | Overflow de flash — límite documentado en F07_max_rows_y_flash_investigacion.md |

El pipeline de fases anteriores (f01–f06) y el firmware C no han sido modificados.

---

## Estado después de las correcciones

### v7_3001
- `timing.itmax_ms`: preservado en 100ms (límite del hardware spec)
- `positive_support`: 726+3 = 729 (correcto, dataset de 5000 filas)
- Seleccionado por v8_0003: sí

### v7_4001
- Ejecutado con `EMBED_DATASET=True` (correcto)
- `timing.itmax_ms`: puede tener valor residual de 286ms de un intento anterior (fix attempt 1 — escala por time_scale_factor)
- Si se necesita usar v7_4001 en f08: re-ejecutar f073 con la nueva versión del script

### v8_0003
- Ha funcionado con `time_scale_factor=0.01` y variante padre v7_3001
- Dos modelos seleccionados son ambos `battery_overheat` (mismo modelo base v6_0019) — no es ideal para multi-modelo, pero válido funcionalmente

---

## Opción B pendiente (modo serial)

Ver memoria: `project_serial_mode_option_b.md` en `/home/tehe/.claude/projects/-home-tehe-Work-tfm-dash-ctrl-mlops-app_ctrl_v2/memory/`

La opción B eliminaría el límite de flash (dataset no compilado en binario), pero requiere implementar el sender Python en f072 y gestionar la bidireccionalidad de UART0.
