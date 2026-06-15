# ESP32 Virtual Runner — Guía rápida

Dos capas independientes:

- **Infraestructura** — TTYD (terminal web) + Cloudflare Tunnel (acceso remoto) + GitHub Actions Runner (CI).
- **Emulación** — socat + QEMU ESP32 (HIL en software, sin hardware real).

---

## Parte 1 — Infraestructura (TTYD + Túnel + Runner)

### Prerequisitos manuales (fuera del Makefile)

- **`cloudflared`**: instalar y autenticar una vez:
  ```bash
  # Debian: descargar el .deb de https://github.com/cloudflare/cloudflared/releases
  sudo dpkg -i cloudflared-linux-amd64.deb
  cloudflared login          # abre navegador para autenticar con tu cuenta CF
  ```
- **`ttyd`**: instalar el binario:
  ```bash
  # Debian: descargar de https://github.com/tsl0922/ttyd/releases
  sudo install -m755 ttyd_linux.x86_64 /usr/local/bin/ttyd
  ```

### Pasos de instalación

```bash
# 1. Configurar variables
cp .env.example .env
# Editar .env y ajustar:
#   TERMINAL_PASS   — contraseña del terminal web
#   GITHUB_TOKEN    — token de registro (GitHub → Settings → Actions → Runners → New runner)
#   GITHUB_URL      — URL del repo, p.ej. https://github.com/org/repo
#   DOMAIN          — dominio base (default: tehelab.com)
#   SUBDOMAIN       — subdominio del terminal (default: terminalESPvirt)
#   RUN_USER        — usuario del sistema que corre los servicios (default: runner)

# 2. Crear túnel en Cloudflare y generar config.yaml
make setup

# 3. Instalar dependencias + registrar servicios systemd
make install

# 4. Arrancar todo
make start
```

### Diagnóstico

```bash
make status       # estado de TTYD + Túnel + Runner
make logs         # logs estáticos de los tres servicios
make logs-live    # logs en vivo combinados (Ctrl+C para salir)
```

### Parar / limpiar

```bash
make stop         # detiene los tres servicios
make clean        # elimina servicios systemd y config.yaml
```

---

## Parte 2 — Emulación ESP32 (QEMU + socat)

Entorno HIL en software: **socat** crea un puerto serie virtual (`/dev/ttyVUSB0`) que actúa como puente TCP hacia **QEMU** emulando una ESP32 real.

---

## Primera vez: instalar emulación

```bash
# Arch Linux y Debian/Ubuntu — el mismo comando, detecta la distro automáticamente
make install-qemu
```

Instala socat, pyserial y compila el fork de Espressif para QEMU en `/opt/qemu-esp32`. Tarda ~15 min por la compilación.

> **Espacio en disco**: la compilación necesita ~2-3 GB libres en `/tmp`. Si el disco está justo, mueve `TMPDIR` o libera espacio antes.

Verificar que todo está OK:

```bash
make verify
```

Salida esperada: todos los checks en `[OK]`, ninguno en `[FALTA]`.

---

## Flujo normal por variante

```
          f071                f072 --build-only    make start-qemu
  params ──────► esp32_project ──────────────────► socat + QEMU activos
                                                         │
                     f072 --skip-flash ◄─────────── make run
                              │
                     f073 ◄───┘
                   make post
```

### 0. Instalar emulador (solo la primera vez)

```bash
make install-qemu
make verify
```

### 1. Compilar firmware

```bash
make VARIANT=mi_variante prepare   # genera build_generated/ (f071)
make VARIANT=mi_variante build     # compila con idf.py vía Docker
```

### 2. Lanzar entorno virtual

```bash
make VARIANT=mi_variante start-qemu
```

- Arranca **socat** en background (sudo): crea `/dev/ttyVUSB0` ↔ TCP 4000
- Arranca **QEMU** en background: carga `build/flasher_args.json`, conecta UART a TCP 4000
- PIDs guardados en `/tmp/esp32-virt/`

### 3. Ejecutar pipeline de validación

```bash
make VARIANT=mi_variante run
```

Llama a `f072_flashrun.py --mode memory --skip-flash`. Inyecta el dataset por el puerto virtual y captura la respuesta de QEMU.

### 4. Análisis post-ejecución

```bash
make VARIANT=mi_variante post
```

Llama a `f073_post.py`. Genera `metrics_models.csv`, `metrics_memory.csv`, `outputs.yaml`.

### 5. Parar el entorno

```bash
make stop-qemu
```

Mata socat y QEMU, elimina `/dev/ttyVUSB0` y los PID files.

---

## Variables configurables (emulación)

| Variable | Default | Descripción |
|---|---|---|
| `VARIANT` | _(requerido)_ | Nombre de la variante |
| `SOCAT_PORT` | `4000` | Puerto TCP socat ↔ QEMU |
| `VIRTUAL_PORT` | `/dev/ttyVUSB0` | Ruta del puerto serie virtual |
| `QEMU_INSTALL_DIR` | `/opt/qemu-esp32` | Instalación del fork QEMU Espressif |

```bash
# Ejemplo con variables personalizadas
make VARIANT=v3_quant SOCAT_PORT=4001 start-qemu
```

---

## Logs y diagnóstico (emulación)

| Fichero | Contenido |
|---|---|
| `/tmp/esp32-virt/qemu.log` | Salida de QEMU (boot, UART, errores) |
| `/tmp/esp32-virt/socat.log` | Errores de socat |
| `executions/f07_modval/<v>/07_esp_monitor_log.txt` | Captura serie del pipeline |
| `executions/f07_modval/<v>/07_esp_build_log.txt` | Log de compilación idf.py |

```bash
tail -f /tmp/esp32-virt/qemu.log
tail -f executions/f07_modval/<VARIANT>/07_esp_monitor_log.txt
```

---

## Problemas comunes

**`[FALTA] -machine esp32`** → Falta el fork Espressif:
```bash
make install-qemu
```

**`ERROR: No existe .../build/flasher_args.json`** → El build no completó:
```bash
make VARIANT=<v> build
```

**`ERROR: socat no está corriendo`** → Hay que hacer `start-qemu` antes de `run`:
```bash
make VARIANT=<v> start-qemu && make VARIANT=<v> run
```

**QEMU termina inmediatamente** → El `flasher_args.json` apunta a binarios incorrectos. Revisa `/tmp/esp32-virt/qemu.log`.
