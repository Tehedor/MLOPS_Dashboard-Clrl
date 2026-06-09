# ESP32 Virtual Runner — Guía rápida

Entorno HIL en software: **socat** crea un puerto serie virtual (`/dev/ttyVUSB0`) que actúa como puente TCP hacia **QEMU** emulando una ESP32 real.

---

## Primera vez: instalar

```bash
# Arch Linux
make install-arch

# Debian / Ubuntu
make install-debian
```

> Si `qemu-system-xtensa` del sistema no soporta `-machine esp32` (lo comprueba automáticamente), descarga y compila el fork de Espressif en `/opt/qemu-esp32`. Tarda ~15 min.

Verificar que todo está OK:

```bash
make verify
```

Salida esperada: todos los checks en `[OK]`, ninguno en `[FALTA]`.

---

## Flujo normal por variante

```
          f071                f072 --build-only       make start
  params ──────► esp32_project ──────────────────► socat + QEMU activos
                                                         │
                     f072 --skip-flash ◄─────────── make run
                              │
                     f073 ◄───┘
                   make post
```

### 1. Compilar firmware

```bash
make VARIANT=mi_variante build
```

Llama a `f072_flashrun.py --build-only`. Genera `executions/f07_modval/<v>/esp32_project/build/`.

### 2. Lanzar entorno virtual

```bash
make VARIANT=mi_variante start
```

- Arranca **socat** en background (sudo): crea `/dev/ttyVUSB0` ↔ TCP 4000
- Arranca **QEMU** en background: carga `build/flasher_args.json`, conecta UART a TCP 4000
- PIDs guardados en `/tmp/esp32-virt/`

### 3. Ejecutar pipeline de validación

```bash
make VARIANT=mi_variante run
```

Llama a `f072_flashrun.py --mode serial --port /dev/ttyVUSB0 --skip-flash`.  
El script inyecta el dataset por el puerto virtual y captura la respuesta de QEMU.

### 4. Análisis post-ejecución

```bash
make VARIANT=mi_variante post
```

Llama a `f073_post.py`. Genera `metrics_models.csv`, `metrics_memory.csv`, `outputs.yaml`.

### 5. Parar el entorno

```bash
make stop
```

Mata socat y QEMU, elimina `/dev/ttyVUSB0` y los PID files.

---

## Variables configurables

| Variable | Default | Descripción |
|---|---|---|
| `VARIANT` | _(requerido)_ | Nombre de la variante |
| `SOCAT_PORT` | `4000` | Puerto TCP socat ↔ QEMU |
| `VIRTUAL_PORT` | `/dev/ttyVUSB0` | Ruta del puerto serie virtual |
| `QEMU_INSTALL_DIR` | `/opt/qemu-esp32` | Instalación del fork QEMU Espressif |
| `ESP_PROJECT_DIR` | auto desde `VARIANT` | Ruta al proyecto ESP32 compilado |

```bash
# Ejemplo con variables personalizadas
make VARIANT=v3_quant SOCAT_PORT=4001 start
```

---

## Logs y diagnóstico

| Fichero | Contenido |
|---|---|
| `/tmp/esp32-virt/qemu.log` | Salida de QEMU (boot, UART, errores) |
| `/tmp/esp32-virt/socat.log` | Errores de socat |
| `executions/f07_modval/<v>/07_esp_monitor_log.txt` | Captura serie del pipeline |
| `executions/f07_modval/<v>/07_esp_build_log.txt` | Log de compilación idf.py |

```bash
# Ver QEMU en tiempo real
tail -f /tmp/esp32-virt/qemu.log

# Ver captura serie
tail -f executions/f07_modval/<VARIANT>/07_esp_monitor_log.txt
```

---

## Problemas comunes

**`[FALTA] -machine esp32`** → El QEMU del sistema no tiene el fork Espressif:
```bash
make install-qemu-esp32
```

**`ERROR: No existe .../build/flasher_args.json`** → El build no completó:
```bash
make VARIANT=<v> build
```

**`ERROR: socat no está corriendo`** → Hay que hacer `start` antes de `run`:
```bash
make VARIANT=<v> start && make VARIANT=<v> run
```

**QEMU termina inmediatamente** → El `flasher_args.json` apunta a binarios incorrectos o el build está incompleto. Revisa `/tmp/esp32-virt/qemu.log`.
