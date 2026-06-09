### Documentación de Configuración: MLOps ESP32 Simulation Pipeline (QEMU + socat)

**Objetivo:** Establecer un entorno de simulación *Hardware-in-the-Loop* (HIL) puramente en software. El pipeline en Python debe comunicarse con una ESP32 emulada en QEMU a través de un puerto serie virtual, omitiendo el proceso físico de flasheo.

#### Paso 1: Modificación del Script de Orquestación (`f072_flash_run.py`)

El script actual intenta flashear la ESP32 usando `esptool.py`. Hay que añadir un *flag* para saltar este paso cuando usemos el emulador.

1. **Añadir el argumento CLI:** En la función `main()` (aprox. línea 818), registrar el nuevo argumento:
```python
parser.add_argument("--skip-flash", action="store_true", help="Omite el flasheo mediante esptool (requerido para QEMU)")

```


2. **Condicionar el bloque de flasheo:** En la sección `=== FLASH ===` de la función `main()`, envolver la llamada a `flash_portable`:
```python
# =========================================================
# FLASH
# =========================================================
if not args.skip_flash:
    print("\n=== FLASH ===")
    flash_portable(
        port=port,
        flash_log=flash_log,
        esp_project_dir=esp_project_dir,
        docker_memory_limit=docker_memory_limit,
        docker_memory_swap=docker_memory_swap,
        docker_cpus=docker_cpus,
    )
else:
    print("\n=== FLASH (SALTADO POR --skip-flash) ===")

```



#### Paso 2: Creación del Puente Serie-TCP (`socat`)

El script Python busca automáticamente puertos con el patrón `/dev/ttyVUSB*`. Vamos a crear un dispositivo virtual que actúe como puente bidireccional hacia un puerto TCP local (4000) donde escuchará QEMU.

* **Comando (Ejecutar en Terminal 1 - Background/Daemon):**
```bash
sudo socat pty,link=/dev/ttyVUSB0,raw,echo=0,ignoreeof tcp-listen:4000,reuseaddr

```


* **Ajuste de permisos:** Asegurar que el script Python (usuario sin privilegios) pueda leer y escribir en el puerto virtual:
```bash
sudo chmod 666 /dev/ttyVUSB0

```



#### Paso 3: Compilación del Firmware (Build-Only)

Antes de lanzar el emulador, necesitamos los binarios `.elf` y `.bin` actualizados de la variante actual.

* **Comando (Ejecutar en Terminal 2):**
```bash
python f072_flash_run.py --variant <NOMBRE_VARIANTE> --build-only

```



#### Paso 4: Lanzamiento del Emulador ESP32 (QEMU)

Usaremos el fork oficial de QEMU de Espressif. El emulador debe arrancar cargando directamente el mapa de memoria (`flasher_args.json`) y conectando su UART0 al puente TCP que hemos creado en el Paso 2.

* **Comando (Ejecutar en Terminal 3 - Background):**
*Nota: Asegurarse de ejecutar esto desde el directorio del proyecto ESP32 o ajustar la ruta a `build/flasher_args.json`.*
```bash
qemu-system-xtensa -nographic \
    -machine esp32 \
    -drive file=build/flasher_args.json,if=mtd,format=raw \
    -serial tcp:127.0.0.1:4000

```



#### Paso 5: Ejecución del Pipeline de Validación

Con `socat` y `QEMU` corriendo de fondo, lanzamos el script de validación. El script detectará `/dev/ttyVUSB0`, omitirá el flasheo gracias al flag `--skip-flash` y procederá a inyectar el dataset y capturar las respuestas.

* **Comando (Ejecutar en Terminal 2):**
```bash
python f072_flash_run.py --variant <NOMBRE_VARIANTE> --mode serial --skip-flash

```



---

**Nota para Claude Code:** Si vas a orquestar esto en un script de bash único para testing automatizado (CI/CD), recuerda lanzar `socat` y `qemu-system-xtensa` en segundo plano usando `&`, guardar sus PIDs (`$!`) y matarlos de forma limpia (`kill $PID`) al finalizar la ejecución de `f072_flash_run.py` para no dejar puertos bloqueados.