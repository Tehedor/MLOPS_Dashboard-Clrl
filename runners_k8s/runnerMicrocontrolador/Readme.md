Aquí tienes un `README.md` estructurado, directo y listo para añadir a tu repositorio o carpeta de trabajo. Explica exactamente el propósito de la infraestructura y detalla el orden estricto en el que se deben ejecutar los comandos.

Puedes guardarlo como `README.md` en la raíz de tu proyecto:

```markdown
# 🛠️ Gestor de Terminal Web (TTYD) y Túnel Cloudflare

Este proyecto automatiza la creación, configuración y despliegue de una terminal web segura (`ttyd`) expuesta a Internet a través de un túnel de Cloudflare (`cloudflared`). Todo se ejecuta en segundo plano como servicios nativos de Linux (`systemd`), garantizando resiliencia y evitando conflictos con otros procesos como GitHub Actions Runners.

## 📁 Estructura del Proyecto

Asegúrate de tener esta estructura antes de empezar:

```text
/home/runner/
├── Makefile                 # Orquestador de comandos
├── .env.example             # Plantilla de variables de entorno
└── templates/               # Plantillas de configuración
    ├── cftunnel.service.tpl # Plantilla del demonio de Cloudflare
    ├── config.yaml.tpl      # Plantilla del túnel
    └── ttyd.service.tpl     # Plantilla del demonio de la terminal

```

## 📋 Requisitos Previos

1. **Dependencias instaladas:** Debes tener instalados `ttyd` y `cloudflared` en tu sistema operativo.
2. **Autenticación en Cloudflare:** Antes de ejecutar ningún script, debes autenticar tu máquina en Cloudflare. Ejecuta este comando y sigue el enlace en el navegador:
```bash
cloudflared tunnel login

```



---

## 🚀 Orden de Ejecución (Puesta en marcha)

Sigue estos pasos en estricto orden para levantar la infraestructura por primera vez:

### 1. Configurar Variables de Entorno

Crea tu archivo `.env` a partir del ejemplo y edítalo con tus credenciales seguras, dominio y puertos.

```bash
cp .env.example .env
nano .env

```

### 2. Generar el Túnel e Infraestructura

Este comando se comunica con la API de Cloudflare, crea el túnel, enruta el subdominio DNS y genera el archivo `config.yaml` dinámicamente utilizando los datos de tu `.env`.

```bash
make setup

```

### 3. Instalar los Servicios en Systemd

Este paso inyecta tus variables en las plantillas `.tpl`, mueve los archivos a `/etc/systemd/system/` y recarga el demonio de Linux. *(Requerirá permisos de `sudo`)*.

```bash
make install

```

### 4. Arrancar los Servicios

Inicia tanto la terminal web como el túnel de Cloudflare simultáneamente.

```bash
make start

```

### 5. Verificar el Estado

Comprueba que ambos servicios están corriendo (deben aparecer como `Active: active (running)`).

```bash
make status

```

¡Listo! Ya puedes acceder a tu terminal desde el navegador usando el subdominio que configuraste (ej. `https://terminalESP.tehelab.com`).

---

## 🧰 Referencia Rápida de Comandos (Makefile)

El `Makefile` es modular. Puedes controlar toda la infraestructura de golpe o servicio por servicio.

### Comandos Globales (Afectan a todo)

* `make setup` : Crea túnel y genera `config.yaml`.
* `make install` : Genera los `.service` e instala en systemd.
* `make start` : Enciende todo.
* `make stop` : Apaga todo.
* `make status` : Muestra el estado de los procesos.
* `make logs` : Muestra las últimas 15 líneas de log.
* `make clean` : **Peligro.** Borra el túnel en Cloudflare, elimina configuraciones y desinstala los demonios.

### Comandos Modulares (Quirúrgicos)

Si solo quieres interactuar con un servicio sin afectar al otro, añade el sufijo `-ttyd` o `-tunnel` al comando. Ejemplos:

* `make start-ttyd` (Arranca solo la terminal)
* `make stop-tunnel` (Corta el acceso a internet, pero la terminal sigue viva localmente)
* `make logs-ttyd` (Revisa los accesos a la terminal)
* `make restart-tunnel` (Para reiniciar un servicio concreto, usa `make stop-tunnel` y luego `make start-tunnel`)

```

```