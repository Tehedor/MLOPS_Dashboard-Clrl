# 🛠️ Gestor de Infraestructura MLOps (TTYD + Cloudflare Tunnel + GitHub Runner)

Este proyecto automatiza la creación, configuración y despliegue de una pila completa de infraestructura. Incluye una terminal web segura (`ttyd`) expuesta a Internet a través de un túnel de Cloudflare (`cloudflared`), junto con un ejecutor de flujos de trabajo automatizados (`GitHub Actions Runner`). 

Todo se configura de manera modular y se ejecuta en segundo plano como servicios nativos de Linux (`systemd`), garantizando resiliencia y auto-recuperación ante fallos.

- [🛠️ Gestor de Infraestructura MLOps (TTYD + Cloudflare Tunnel + GitHub Runner)](#️-gestor-de-infraestructura-mlops-ttyd--cloudflare-tunnel--github-runner)
  - [📁 Estructura del Proyecto](#-estructura-del-proyecto)
  - [📦 Instalación de Dependencias Previas](#-instalación-de-dependencias-previas)
    - [1. Paquetes del sistema base](#1-paquetes-del-sistema-base)
    - [2. Instalación de TTYD (Terminal Web)](#2-instalación-de-ttyd-terminal-web)
    - [3. Instalación de Cloudflared (Túnel)](#3-instalación-de-cloudflared-túnel)
    - [4. Autenticación y Token](#4-autenticación-y-token)
  - [🚀 Orden de Ejecución (Puesta en marcha)](#-orden-de-ejecución-puesta-en-marcha)
    - [1. Configurar Variables de Entorno](#1-configurar-variables-de-entorno)
    - [2. Generar el Túnel Cloudflare](#2-generar-el-túnel-cloudflare)
    - [3. Instalar y Registrar la Infraestructura](#3-instalar-y-registrar-la-infraestructura)
    - [4. Arrancar los Servicios](#4-arrancar-los-servicios)
    - [5. Verificar el Estado](#5-verificar-el-estado)
  - [🧰 Referencia Rápida de Comandos (Makefile)](#-referencia-rápida-de-comandos-makefile)
    - [Comandos Globales (Afectan a los 3 servicios)](#comandos-globales-afectan-a-los-3-servicios)
    - [Comandos Modulares (Quirúrgicos)](#comandos-modulares-quirúrgicos)
  - [🛑 Parada, Limpieza y Renovación de Tokens](#-parada-limpieza-y-renovación-de-tokens)
    - [Pausar la Infraestructura (Parada Temporal)](#pausar-la-infraestructura-parada-temporal)
    - [Limpieza Profunda (Borrado Total)](#limpieza-profunda-borrado-total)
    - [🔄 Renovación de Token de GitHub](#-renovación-de-token-de-github)


## 📁 Estructura del Proyecto
```markdown
Asegúrate de tener esta estructura base antes de empezar (la carpeta del runner se generará sola):

```text
/home/runner/
├── Makefile                 # Orquestador central de comandos
├── .env.example             # Plantilla de variables de entorno
├── actions-runner/          # (Autogenerada) Binarios y entorno de GitHub Runner
└── templates/               # Plantillas de configuración de servicios
    ├── cftunnel.service.tpl # Plantilla del demonio de Cloudflare
    ├── config.yaml.tpl      # Plantilla de enrutamiento del túnel
    └── ttyd.service.tpl     # Plantilla del demonio de la terminal
```

---

## 📦 Instalación de Dependencias Previas

Antes de usar el `Makefile`, el sistema operativo debe tener instalados los paquetes base. *(Nota: El GitHub Runner NO necesita instalarse a mano, el Makefile lo descargará e instalará automáticamente).*

### 1. Paquetes del sistema base

```bash
sudo apt update
sudo apt install -y make curl wget tar sudo
```

### 2. Instalación de TTYD (Terminal Web)

```bash
wget -O ttyd [https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64](https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64)
chmod +x ttyd
sudo mv ttyd /usr/local/bin/
```

### 3. Instalación de Cloudflared (Túnel)

```bash
curl -L -o cloudflared.deb [https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb)
sudo dpkg -i cloudflared.deb
rm cloudflared.deb
```

### 4. Autenticación y Token

* **Cloudflare:** Autentica la máquina ejecutando `cloudflared tunnel login` y siguiendo el enlace en el navegador.
* **GitHub:** Ve a *Settings > Actions > Runners > New self-hosted runner* en tu repositorio y copia el **Token** generado.

---

## 🚀 Orden de Ejecución (Puesta en marcha)

Sigue estos pasos en estricto orden para levantar toda la infraestructura por primera vez:

### 1. Configurar Variables de Entorno

Crea tu archivo `.env` a partir del ejemplo. Deberás configurar tus credenciales web, el dominio y el Token de GitHub.

```bash
cp .env.example .env
vim .env
```

### 2. Generar el Túnel Cloudflare

Crea el túnel, enruta el subdominio DNS y genera el archivo `config.yaml`.

```bash
make setup
```

### 3. Instalar y Registrar la Infraestructura

Descarga los binarios de GitHub Runner, registra el nodo en GitHub, inyecta las variables y crea los tres demonios de Linux. *(Requerirá contraseña de sudo)*.

```bash
make install
```

### 4. Arrancar los Servicios

Inicia simultáneamente la terminal web, el túnel DNS y el ejecutor de GitHub.

```bash
make start
```

### 5. Verificar el Estado

Comprueba que los tres servicios están vivos (`Active: active (running)`).

```bash
make status
```

---

## 🧰 Referencia Rápida de Comandos (Makefile)

El `Makefile` es 100% modular. Puedes operar sobre todo de golpe o servicio por servicio.

### Comandos Globales (Afectan a los 3 servicios)

* `make setup` : Crea túnel en Cloudflare y genera `config.yaml`.
* `make install` : Descarga, instala y configura todo.
* `make start` : Enciende todos los servicios.
* `make stop` : Apaga todos los servicios.
* `make status` : Muestra el estado global de los procesos.
* `make logs` : Muestra un resumen estático de los logs.
* `make logs-live` : 🔴 Muestra los logs en tiempo real combinados (TTYD + Tunnel).

### Comandos Modulares (Quirúrgicos)

Añade el sufijo `-ttyd`, `-tunnel` o `-runner` al final de la acción deseada:

* **Control individual:**
* `make start-runner` (Arranca solo el ejecutor de GitHub).
* `make stop-tunnel` (Corta internet local, pero la terminal sigue viva).


* **Monitorización en tiempo real (Live Logs):**
* `make logs-live-runner` (Ver el Runner procesando pipelines).
* `make logs-live-ttyd` (Ver conexiones HTTP a la terminal).
* `make logs-live-tunnel` (Ver estado de las conexiones de red).



---

## 🛑 Parada, Limpieza y Renovación de Tokens

### Pausar la Infraestructura (Parada Temporal)

Si solo quieres detener el consumo de CPU/RAM temporalmente pero mantener la configuración intacta:

```bash
make stop
# O individualmente: make stop-runner, make stop-tunnel
```

### Limpieza Profunda (Borrado Total)

⚠️ **Peligro.** Esto detiene los servicios, desinstala los demonios, elimina el túnel en Cloudflare y desregistra la máquina de GitHub. Ideal para instalaciones limpias o cambios de servidor.

```bash
make clean
```

### 🔄 Renovación de Token de GitHub

Si tu Runner queda inactivo y GitHub lo expulsa (o el token caduca), no necesitas borrar todo:

1. Genera un nuevo token en GitHub.
2. Actualiza `GITHUB_TOKEN=nuevo_token` en tu archivo `.env`.
3. Ejecuta `make clean-runner`.
4. Ejecuta `make install-runner` seguido de `make start-runner`.
