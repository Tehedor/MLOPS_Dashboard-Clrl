# ==============================================================================
# ESP32 Virtual Runner
# Infraestructura: TTYD + Cloudflare Tunnel + GitHub Runner  (igual que runner físico)
# Emulación:       socat + QEMU ESP32  (make install-qemu / make start-qemu)
#
# Uso rápido (infraestructura):
#   make setup                           crea túnel CF y genera config.yaml
#   make install                         instala y registra servicios systemd
#   make start                           inicia TTYD + Túnel + Runner
#   make stop                            detiene todos los servicios
#
# Uso rápido (emulación):
#   make install-qemu                    instala socat + compila QEMU ESP32
#   make verify                          verifica que el entorno virtual está listo
#   make VARIANT=<v> prepare             genera build_generated/ (f071)
#   make VARIANT=<v> build               compila firmware (idf.py vía Docker)
#   make VARIANT=<v> start-qemu          lanza socat + QEMU en background
#   make VARIANT=<v> run                 ejecuta validación (--skip-flash)
#   make VARIANT=<v> post                análisis post-ejecución (f073)
#   make stop-qemu                       para socat y QEMU
# ==============================================================================

# ==============================================================================
# CARGA DE VARIABLES (.env)
# ==============================================================================
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# ==============================================================================
# VALORES POR DEFECTO
# ==============================================================================
# Terminal y Túnel
DOMAIN        ?= tehelab.com
SUBDOMAIN     ?= terminalESPvirt
PORT          ?= 7682
TUNNEL_NAME   ?= runner-esp32-virt-tunnel
TERMINAL_USER ?= admin
TERMINAL_PASS ?= tu_clave_segura
RUN_USER      ?= runner

# Python venv — debe coincidir con $HOME/.venv del usuario runner (el workflow añade este path)
VENV_DIR      ?= /home/$(RUN_USER)/.venv

# GitHub Runner
RUNNER_DIR    ?= /home/$(RUN_USER)/actions-runner
GITHUB_URL    ?= https://github.com/Tehedor/MLOps_actions_v2
GITHUB_TOKEN  ?= AYIURPQROSPWEDBEWMVVPATKCV5OK
RUNNER_NAME   ?= MLOPSRunnerVirtual
RUNNER_LABELS ?= "self-hosted-tehelab,mlops,tfm,qemu"
RUNNER_VER    ?= 2.334.0
RUNNER_HASH   ?= 048024cd2c848eb6f14d5646d56c13a4def2ae7ee3ad12122bee960c56f3d271
GH_REPO       ?= $(patsubst https://github.com/%,%,$(GITHUB_URL))

# Emulación (socat + QEMU)
VARIANT          ?=
PYTHON           ?= python3
SOCAT_PORT       ?= 4000
VIRTUAL_PORT     ?= /dev/ttyVUSB0
QEMU_INSTALL_DIR ?= /opt/qemu-esp32

# ==============================================================================
# RUTAS DINÁMICAS (No tocar)
# ==============================================================================
PROJECT_DIR   := $(shell pwd)
CLOUDFLARED   := $(shell which cloudflared 2>/dev/null)
TTYD          := $(shell which ttyd 2>/dev/null)
FULL_FQDN     := $(SUBDOMAIN).$(DOMAIN)
export PROJECT_DIR CLOUDFLARED TTYD FULL_FQDN

QEMU_BIN := $(shell \
	if [ -x "$(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa" ]; then \
		echo "$(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa"; \
	else \
		command -v qemu-system-xtensa 2>/dev/null || echo "qemu-system-xtensa"; \
	fi)

ESP_PROJECT_DIR ?= $(PROJECT_DIR)/executions/f07_modval/$(VARIANT)/esp32_project

PID_DIR    := /tmp/esp32-virt
SOCAT_PID  := $(PID_DIR)/socat.pid
QEMU_PID   := $(PID_DIR)/qemu.pid
STATE_FILE := $(PROJECT_DIR)/.install-state

.PHONY: help setup install start stop status logs logs-live clean daemon-reload \
        install-deps install-sys-deps install-python-deps configure-venv-path \
        install-ttyd start-ttyd stop-ttyd status-ttyd logs-ttyd logs-live-ttyd clean-ttyd \
        install-tunnel start-tunnel stop-tunnel status-tunnel logs-tunnel logs-live-tunnel clean-tunnel \
        install-runner start-runner stop-runner status-runner logs-runner logs-live-runner clean-runner \
        install-qemu install-qemu-build-deps snapshot uninstall verify \
        prepare build start-qemu stop-qemu run post \
        watch-workflow open-workflow

# ==============================================================================
# HELP
# ==============================================================================
help:
	@echo "🛠️  Panel de Control MLOps Virtual (TTYD + CF Tunnel + GitHub Runner + QEMU)"
	@echo "------------------------------------------------------------------------"
	@echo "COMANDOS GLOBALES (infraestructura):"
	@echo "  make setup                - Crea el túnel en CF y genera config.yaml"
	@echo "  make install              - Instala y registra servicios systemd"
	@echo "  make start                - Inicia todos los servicios (TTYD + Túnel + Runner)"
	@echo "  make stop                 - Detiene todos los servicios"
	@echo "  make status               - Estado de todos los servicios"
	@echo "  make logs                 - Logs estáticos de todo el stack"
	@echo "  make logs-live            - 🔴 Logs EN VIVO combinados (TTYD + Tunnel)"
	@echo "  make clean                - Borra toda la infraestructura"
	@echo ""
	@echo "DEPENDENCIAS DEL ENTORNO:"
	@echo "  make install-deps         - Sistema + Python + PATH del venv (todo)"
	@echo "  make install-sys-deps     - Solo paquetes apt/pacman (git, gh, curl...)"
	@echo "  make install-python-deps  - Solo venv en \$$HOME/.venv + requirements.txt"
	@echo "  make configure-venv-path  - Expone el venv al runner (profile.d + systemd)"
	@echo ""
	@echo "EMULACIÓN ESP32 (QEMU):"
	@echo "  make install-qemu             - Instala socat + compila fork QEMU Espressif"
	@echo "  make verify                   - Verifica que el entorno virtual está completo"
	@echo "  make snapshot                 - Registra estado actual del sistema en .install-state"
	@echo "  make uninstall                - Elimina solo lo instalado por este Makefile"
	@echo "  make VARIANT=<v> prepare      - Genera build_generated/ para la variante (f071)"
	@echo "  make VARIANT=<v> build        - Compila firmware (idf.py via Docker)"
	@echo "  make VARIANT=<v> start-qemu   - Lanza socat + QEMU en background"
	@echo "  make stop-qemu                - Para socat y QEMU"
	@echo "  make VARIANT=<v> run          - Ejecuta validación (--skip-flash, modo memoria)"
	@echo "  make VARIANT=<v> post         - Análisis post-ejecución (f073)"
	@echo ""
	@echo "GITHUB ACTIONS:"
	@echo "  make watch-workflow           - Sigue en vivo el último workflow run"
	@echo "  make watch-workflow RUN_ID=X  - Sigue un run concreto"
	@echo "  make open-workflow            - Abre en navegador el último workflow run"
	@echo ""
	@echo "VARIABLES:"
	@echo "  VARIANT           Nombre de la variante (requerido para emulación)"
	@echo "  SOCAT_PORT        Puerto TCP socat <-> QEMU (default: $(SOCAT_PORT))"
	@echo "  VIRTUAL_PORT      Puerto serie virtual (default: $(VIRTUAL_PORT))"
	@echo "  QEMU_INSTALL_DIR  Instalación fork QEMU Espressif (default: $(QEMU_INSTALL_DIR))"

# ==============================================================================
# 0. DEPENDENCIAS DEL ENTORNO (Sistema + Python)
# ==============================================================================
install-sys-deps:
	@echo "📦 Instalando paquetes del sistema..."
	@if command -v pacman >/dev/null 2>&1; then \
		sudo pacman -Sy --noconfirm --needed \
			git make procps-ng util-linux curl ca-certificates; \
		command -v gh >/dev/null 2>&1 || \
			sudo pacman -Sy --noconfirm --needed github-cli 2>/dev/null || \
			{ echo "⚠️  gh no disponible en repos oficiales. Instala con: yay -S github-cli"; }; \
	elif command -v apt-get >/dev/null 2>&1; then \
		sudo apt-get update && sudo apt-get install -y --no-install-recommends \
			git make procps util-linux curl ca-certificates gnupg; \
		echo "🔑 Añadiendo repositorio GitHub CLI..."; \
		sudo mkdir -p /etc/apt/keyrings; \
		curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
			| sudo gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
		sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg; \
		echo "deb [arch=$$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
			| sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null; \
		sudo apt-get update && sudo apt-get install -y --no-install-recommends gh; \
		sudo rm -rf /var/lib/apt/lists/*; \
	else \
		echo "❌ ERROR: Distro no reconocida. Instala manualmente: git gh curl"; exit 1; \
	fi
	@echo "✅ Paquetes del sistema instalados."

install-python-deps:
	@echo "🐍 Creando venv en $(VENV_DIR)..."
	@python3 -m venv $(VENV_DIR)
	@echo "📦 Instalando dependencias Python..."
	@$(VENV_DIR)/bin/pip install --upgrade pip "setuptools>=68,<81" wheel
	@$(VENV_DIR)/bin/pip install -r $(PROJECT_DIR)/requirements.txt
	@echo "✅ Dependencias Python instaladas en $(VENV_DIR)."
	@$(MAKE) configure-venv-path

configure-venv-path:
	@echo "🔧 Exponiendo $(VENV_DIR)/bin en el entorno del sistema..."
	@printf 'export VIRTUAL_ENV=$(VENV_DIR)\nexport PATH="$(VENV_DIR)/bin:$$PATH"\n' \
		| sudo tee /etc/profile.d/mlops-venv.sh > /dev/null
	@sudo chmod +x /etc/profile.d/mlops-venv.sh
	@echo "   → /etc/profile.d/mlops-venv.sh escrito"
	@grep -qxF '. /etc/profile.d/mlops-venv.sh' /home/$(RUN_USER)/.bashrc 2>/dev/null || \
		echo '. /etc/profile.d/mlops-venv.sh' | sudo tee -a /home/$(RUN_USER)/.bashrc > /dev/null
	@grep -qxF '. /etc/profile.d/mlops-venv.sh' /home/$(RUN_USER)/.profile 2>/dev/null || \
		echo '. /etc/profile.d/mlops-venv.sh' | sudo tee -a /home/$(RUN_USER)/.profile > /dev/null
	@echo "   → .bashrc y .profile del usuario $(RUN_USER) actualizados"
	@if [ -f "$(RUNNER_DIR)/.service" ]; then \
		SVC=$$(cat $(RUNNER_DIR)/.service); \
		sudo mkdir -p /etc/systemd/system/$$SVC.d; \
		printf '[Service]\nEnvironment="PATH=$(VENV_DIR)/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\nEnvironment="VIRTUAL_ENV=$(VENV_DIR)"\n' \
			| sudo tee /etc/systemd/system/$$SVC.d/venv-path.conf > /dev/null; \
		sudo systemctl daemon-reload; \
		echo "   → Drop-in systemd creado: /etc/systemd/system/$$SVC.d/venv-path.conf"; \
		echo "   Reinicia el runner para aplicar: make stop-runner && make start-runner"; \
	else \
		echo "   ℹ️  Runner no instalado aún; el drop-in systemd se creará al ejecutar install-runner"; \
	fi
	@echo "✅ PATH del venv configurado."

install-deps: install-sys-deps install-python-deps
	@echo "✅ Instalación completa: sistema + Python + PATH lista."

# ==============================================================================
# 1. SETUP — crea túnel Cloudflare y genera config.yaml
# ==============================================================================
setup:
	@echo "🚀 Comprobando túnel para $(FULL_FQDN)..."
	@$(CLOUDFLARED) tunnel create $(TUNNEL_NAME) >/dev/null 2>&1 || echo "ℹ️  El túnel ya existe en Cloudflare, reutilizando identidad..."
	@echo "🧹 Asegurando enrutamiento DNS limpio..."
	@$(CLOUDFLARED) tunnel route dns delete $(TUNNEL_NAME) $(FULL_FQDN) >/dev/null 2>&1 || true
	@$(CLOUDFLARED) tunnel route dns $(TUNNEL_NAME) $(FULL_FQDN) >/dev/null 2>&1 || true
	@echo "⏳ Esperando propagación de API..."
	@sleep 2
	@TUNNEL_ID=$$($(CLOUDFLARED) tunnel list | grep "$(TUNNEL_NAME)" | head -n 1 | sed 's/[[:space:]].*//'); \
	if [ -z "$$TUNNEL_ID" ]; then echo "❌ Error al obtener el ID del túnel."; exit 1; fi; \
	echo "✅ Túnel ID: $$TUNNEL_ID"; \
	sed -e "s|__TUNNEL_ID__|$$TUNNEL_ID|g" \
	    -e "s|__RUN_USER__|$(RUN_USER)|g" \
	    -e "s|__FULL_FQDN__|$(FULL_FQDN)|g" \
	    -e "s|__PORT__|$(PORT)|g" \
	    templates/config.yaml.tpl > $(PROJECT_DIR)/config.yaml
	@echo "✅ config.yaml generado correctamente."

# ==============================================================================
# 2. TTYD (Terminal Web)
# ==============================================================================
install-ttyd:
	@echo "⚙️  Instalando ttyd.service..."
	@sed -e 's|__RUN_USER__|$(RUN_USER)|g' \
	     -e 's|__PROJECT_DIR__|$(PROJECT_DIR)|g' \
	     -e 's|__TTYD__|$(TTYD)|g' \
	     -e 's|__PORT__|$(PORT)|g' \
	     -e 's|__TERMINAL_USER__|$(TERMINAL_USER)|g' \
	     -e 's|__TERMINAL_PASS__|$(TERMINAL_PASS)|g' \
	     templates/ttyd.service.tpl | sudo tee /etc/systemd/system/ttyd.service > /dev/null

start-ttyd:
	@sudo systemctl start ttyd.service
	@echo "▶️  TTYD iniciado."

stop-ttyd:
	@sudo systemctl stop ttyd.service
	@echo "⏹️  TTYD detenido."

status-ttyd:
	@echo "📊 Estado TTYD:"
	@sudo systemctl status ttyd.service --no-pager | grep Active || true

logs-ttyd:
	@echo "📋 Logs TTYD:"
	@sudo journalctl -u ttyd.service -n 15 --no-pager

logs-live-ttyd:
	@echo "🔴 Logs EN VIVO TTYD (Ctrl+C para salir)..."
	@sudo journalctl -u ttyd.service -f

clean-ttyd: stop-ttyd
	@echo "🗑️  Limpiando TTYD..."
	@sudo systemctl disable ttyd.service >/dev/null 2>&1 || true
	@sudo rm -f /etc/systemd/system/ttyd.service

# ==============================================================================
# 3. CLOUDFLARE TUNNEL
# ==============================================================================
install-tunnel:
	@echo "⚙️  Instalando cftunnel.service..."
	@sed -e 's|__RUN_USER__|$(RUN_USER)|g' \
	     -e 's|__PROJECT_DIR__|$(PROJECT_DIR)|g' \
	     -e 's|__CLOUDFLARED__|$(CLOUDFLARED)|g' \
	     -e 's|__TUNNEL_NAME__|$(TUNNEL_NAME)|g' \
	     templates/cftunnel.service.tpl | sudo tee /etc/systemd/system/cftunnel.service > /dev/null

start-tunnel:
	@sudo systemctl start cftunnel.service
	@echo "▶️  Cloudflare Tunnel iniciado."

stop-tunnel:
	@sudo systemctl stop cftunnel.service
	@echo "⏹️  Cloudflare Tunnel detenido."

status-tunnel:
	@echo "📊 Estado Cloudflare Tunnel:"
	@sudo systemctl status cftunnel.service --no-pager | grep Active || true

logs-tunnel:
	@echo "📋 Logs Cloudflare Tunnel:"
	@sudo journalctl -u cftunnel.service -n 15 --no-pager

logs-live-tunnel:
	@echo "🔴 Logs EN VIVO Cloudflare Tunnel (Ctrl+C para salir)..."
	@sudo journalctl -u cftunnel.service -f

clean-tunnel: stop-tunnel
	@echo "🗑️  Limpiando configuración local de Cloudflare..."
	@sudo systemctl disable cftunnel.service >/dev/null 2>&1 || true
	@sudo rm -f /etc/systemd/system/cftunnel.service
	@echo "🧹 Desvinculando ruta DNS para evitar bloqueos..."
	@$(CLOUDFLARED) tunnel route dns delete $(TUNNEL_NAME) $(FULL_FQDN) >/dev/null 2>&1 || true
	@rm -f $(PROJECT_DIR)/config.yaml
	@echo "✅ Lado local e histórico de DNS limpios."

# ==============================================================================
# 4. GITHUB RUNNER (Descarga, Registro y Servicio)
# ==============================================================================
install-runner:
	@echo "⚙️  Descargando e instalando dependencias del GitHub Runner..."
	@mkdir -p $(RUNNER_DIR)
	@cd $(RUNNER_DIR) && \
	if [ ! -f config.sh ]; then \
		curl -o actions-runner-linux-x64-$(RUNNER_VER).tar.gz -L https://github.com/actions/runner/releases/download/v$(RUNNER_VER)/actions-runner-linux-x64-$(RUNNER_VER).tar.gz; \
		echo "$(RUNNER_HASH)  actions-runner-linux-x64-$(RUNNER_VER).tar.gz" | shasum -a 256 -c; \
		tar xzf ./actions-runner-linux-x64-$(RUNNER_VER).tar.gz; \
	fi
	@echo "📝 Registrando el Runner en GitHub (Modo Desatendido)..."
	@cd $(RUNNER_DIR) && \
	if [ ! -f .runner ]; then \
		./config.sh --unattended \
			--url $(GITHUB_URL) \
			--token $(GITHUB_TOKEN) \
			--name $(RUNNER_NAME) \
			--runnergroup "Default" \
			--labels $(RUNNER_LABELS) \
			--work "_work" \
			--replace; \
	else \
		echo "ℹ️  Runner ya configurado; se omite el registro."; \
	fi
	@echo "⚙️  Configurando el servicio systemd del Runner..."
	@cd $(RUNNER_DIR) && sudo ./svc.sh install $(RUN_USER) >/dev/null 2>&1 || true
	@$(MAKE) configure-venv-path

start-runner:
	@if [ -d "$(RUNNER_DIR)" ]; then \
		cd $(RUNNER_DIR) && sudo ./svc.sh start >/dev/null 2>&1 || true; \
	else \
		echo "❌ Directorio del Runner no encontrado."; \
	fi
	@echo "▶️  GitHub Runner iniciado."

stop-runner:
	@if [ -d "$(RUNNER_DIR)" ]; then \
		cd $(RUNNER_DIR) && sudo ./svc.sh stop >/dev/null 2>&1 || true; \
	else \
		echo "❌ Directorio del Runner no encontrado."; \
	fi
	@echo "⏹️  GitHub Runner detenido."

status-runner:
	@echo "📊 Estado GitHub Runner:"
	@if [ -f "$(RUNNER_DIR)/.service" ]; then \
		SVC=$$(cat $(RUNNER_DIR)/.service); \
		sudo systemctl is-active $$SVC || true; \
	else echo "❌ Servicio del Runner no encontrado."; fi

logs-runner:
	@echo "📋 Logs GitHub Runner:"
	@if [ -f "$(RUNNER_DIR)/.service" ]; then \
		SVC=$$(cat $(RUNNER_DIR)/.service); \
		sudo journalctl -u $$SVC -n 15 --no-pager; \
	else echo "❌ Servicio del Runner no encontrado."; fi

logs-live-runner:
	@if [ -f "$(RUNNER_DIR)/.service" ]; then \
		SVC=$$(cat $(RUNNER_DIR)/.service); \
		echo "🔴 Logs EN VIVO del Runner [$$SVC] (Ctrl+C para salir)..."; \
		sudo journalctl -u $$SVC -f; \
	else echo "❌ Servicio del Runner no encontrado."; fi

clean-runner: stop-runner
	@echo "🗑️  Limpiando configuración del Runner..."
	@cd $(RUNNER_DIR) && sudo ./svc.sh uninstall || true
	@cd $(RUNNER_DIR) && ./config.sh remove --unattended --token $(GITHUB_TOKEN) || true
	@rm -rf $(RUNNER_DIR)

# ==============================================================================
# 5. COMANDOS GLOBALES (Orquestadores) — idénticos al runner físico
# ==============================================================================
daemon-reload:
	@sudo systemctl daemon-reload
	@sudo systemctl enable ttyd.service cftunnel.service >/dev/null 2>&1 || true

install: install-ttyd install-tunnel install-runner daemon-reload
	@echo "✅ Toda la infraestructura (Terminal + Túnel + Runner) instalada."

start: start-ttyd start-tunnel start-runner
stop: stop-ttyd stop-tunnel stop-runner
status: status-ttyd status-tunnel status-runner
logs: logs-ttyd logs-tunnel logs-runner

logs-live:
	@echo "🔴 Logs EN VIVO combinados (TTYD + Tunnel). Pulsa Ctrl+C para salir."
	@sudo journalctl -u ttyd.service -u cftunnel.service -f

clean: clean-ttyd clean-tunnel clean-runner
	@sudo systemctl daemon-reload
	@echo "✅ Limpieza global completada."

# ==============================================================================
# 6. GITHUB ACTIONS
# ==============================================================================
watch-workflow:
	@echo "🔴 Siguiendo workflow en vivo en $(GH_REPO)..."
	@if [ -n "$(RUN_ID)" ]; then \
		gh run watch "$(RUN_ID)" --repo "$(GH_REPO)" --exit-status; \
	else \
		LATEST_RUN=$$(gh run list --repo "$(GH_REPO)" --limit 1 --json databaseId --jq '.[0].databaseId'); \
		if [ -z "$$LATEST_RUN" ] || [ "$$LATEST_RUN" = "null" ]; then \
			echo "❌ No hay workflow runs en $(GH_REPO)."; \
			exit 1; \
		fi; \
		echo "▶️  Run detectado: $$LATEST_RUN"; \
		gh run watch "$$LATEST_RUN" --repo "$(GH_REPO)" --exit-status; \
	fi

open-workflow:
	@echo "🌐 Abriendo último workflow run en GitHub..."
	@if [ -n "$(RUN_ID)" ]; then \
		gh run view "$(RUN_ID)" --repo "$(GH_REPO)" --web; \
	else \
		LATEST_RUN=$$(gh run list --repo "$(GH_REPO)" --limit 1 --json databaseId --jq '.[0].databaseId'); \
		if [ -z "$$LATEST_RUN" ] || [ "$$LATEST_RUN" = "null" ]; then \
			echo "❌ No hay workflow runs en $(GH_REPO)."; \
			exit 1; \
		fi; \
		echo "▶️  Run detectado: $$LATEST_RUN"; \
		gh run view "$$LATEST_RUN" --repo "$(GH_REPO)" --web; \
	fi

# ==============================================================================
# 7. EMULACIÓN — instalar socat + QEMU ESP32
# ==============================================================================
install-qemu-build-deps:
	@if command -v apt-get >/dev/null 2>&1; then \
		sudo apt-get install -y --no-install-recommends \
			git build-essential ninja-build cmake pkg-config \
			libglib2.0-dev libpixman-1-dev libslirp-dev libgcrypt20-dev; \
	elif command -v pacman >/dev/null 2>&1; then \
		sudo pacman -S --noconfirm --needed \
			base-devel git ninja python pkg-config \
			glib2 pixman libslirp libgcrypt; \
	else \
		echo "❌ ERROR: Distro no reconocida."; exit 1; \
	fi

install-qemu: install-qemu-build-deps
	@echo "📦 Instalando socat..."
	@[ -f $(STATE_FILE) ] || $(MAKE) snapshot
	@PRE_SOCAT=$$(grep "^PRE_SOCAT=" $(STATE_FILE) 2>/dev/null | cut -d= -f2); \
	if command -v pacman >/dev/null 2>&1; then \
		sudo pacman -Sy --noconfirm --needed socat python python-pyserial python-yaml; \
	else \
		sudo apt-get install -y --no-install-recommends socat python3-serial python3-yaml; \
	fi; \
	[ "$$PRE_SOCAT" = "false" ] && sed -i 's/^INST_SOCAT=.*/INST_SOCAT=true/' $(STATE_FILE) || true
	@echo "⚙️  Compilando fork QEMU de Espressif (xtensa-softmmu)..."
	@echo "   Esto puede tardar 10-20 minutos."
	@if [ -x "$(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa" ]; then \
		echo "   Ya instalado: $(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa"; \
	else \
		TMPDIR=$$(mktemp -d /tmp/qemu-esp32-XXXXXX); \
		git clone --depth=1 https://github.com/espressif/qemu.git "$$TMPDIR" && \
		cd "$$TMPDIR" && \
		./configure \
			--target-list=xtensa-softmmu \
			--prefix="$(QEMU_INSTALL_DIR)" \
			--disable-werror \
			--disable-docs && \
		ninja -C build && \
		sudo ninja -C build install && \
		rm -rf "$$TMPDIR"; \
		[ -f $(STATE_FILE) ] || $(MAKE) snapshot; \
		sed -i 's/^INST_QEMU_ESP32=.*/INST_QEMU_ESP32=true/' $(STATE_FILE); \
		sed -i 's|^INST_QEMU_ESP32_PATH=.*|INST_QEMU_ESP32_PATH=$(QEMU_INSTALL_DIR)|' $(STATE_FILE); \
		echo "✅ QEMU ESP32 instalado en $(QEMU_INSTALL_DIR)/bin/"; \
	fi

# ==============================================================================
# 8. SNAPSHOT & UNINSTALL — rastrea qué instaló este Makefile
# ==============================================================================
snapshot:
	@INST_SOCAT=false; INST_QEMU_ESP32=false; QEMU_PATH=$(QEMU_INSTALL_DIR); \
	if [ -f $(STATE_FILE) ]; then \
		V=$$(grep "^INST_SOCAT=" $(STATE_FILE) | cut -d= -f2); [ -n "$$V" ] && INST_SOCAT=$$V; \
		V=$$(grep "^INST_QEMU_ESP32=" $(STATE_FILE) | cut -d= -f2); [ -n "$$V" ] && INST_QEMU_ESP32=$$V; \
		V=$$(grep "^INST_QEMU_ESP32_PATH=" $(STATE_FILE) | cut -d= -f2); [ -n "$$V" ] && QEMU_PATH=$$V; \
	fi; \
	DISTRO=unknown; \
	command -v pacman  >/dev/null 2>&1 && DISTRO=arch; \
	command -v apt-get >/dev/null 2>&1 && DISTRO=debian; \
	{ \
	  echo "# ESP32 Virtual Runner — Install State"; \
	  echo "DISTRO=$$DISTRO"; \
	  echo "CREATED_AT=$$(date +%Y-%m-%d)"; \
	  echo ""; \
	  echo "# Pre-existentes antes de este Makefile (no se tocan en uninstall)"; \
	  command -v socat >/dev/null 2>&1 \
	    && echo "PRE_SOCAT=true" || echo "PRE_SOCAT=false"; \
	  { command -v qemu-system-xtensa >/dev/null 2>&1 && \
	    qemu-system-xtensa -machine help 2>&1 | grep -q "esp32"; } \
	    && echo "PRE_QEMU_ESP32=true" || echo "PRE_QEMU_ESP32=false"; \
	  echo ""; \
	  echo "# Instalado por este Makefile"; \
	  echo "INST_SOCAT=$$INST_SOCAT"; \
	  echo "INST_QEMU_ESP32=$$INST_QEMU_ESP32"; \
	  echo "INST_QEMU_ESP32_PATH=$$QEMU_PATH"; \
	} > $(STATE_FILE)
	@echo "Estado guardado en $(STATE_FILE)"

uninstall:
	@[ -f $(STATE_FILE) ] || { echo "ERROR: no existe $(STATE_FILE). Nada que desinstalar."; exit 1; }
	@echo "=== Desinstalando componentes instalados por este Makefile ==="
	@. $(STATE_FILE); \
	if [ "$$INST_QEMU_ESP32" = "true" ] && [ "$$PRE_QEMU_ESP32" = "false" ]; then \
		echo "[QEMU] Eliminando fork Espressif: $$INST_QEMU_ESP32_PATH"; \
		sudo rm -rf "$$INST_QEMU_ESP32_PATH"; \
	else \
		echo "[QEMU] Nada que eliminar"; \
	fi; \
	if [ "$$INST_SOCAT" = "true" ] && [ "$$PRE_SOCAT" = "false" ]; then \
		echo "[socat] Desinstalando..."; \
		if [ "$$DISTRO" = "arch" ]; then sudo pacman -R --noconfirm socat; \
		else sudo apt-get remove -y socat; fi; \
	else \
		echo "[socat] Nada que eliminar"; \
	fi
	@echo "=== Desinstalación completada ==="

# ==============================================================================
# 9. VERIFY — comprueba que el entorno virtual está completo
# ==============================================================================
verify:
	@echo ""
	@echo "=== Verificación del entorno ESP32 virtual ==="
	@ERRORS=0; \
	if command -v socat >/dev/null 2>&1; then \
		printf "  [OK]    socat       : %s\n" "$$(socat -V 2>&1 | head -1)"; \
	else \
		echo   "  [FALTA] socat        — ejecuta: make install-qemu"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if [ -x "$(QEMU_BIN)" ] || command -v "$(QEMU_BIN)" >/dev/null 2>&1; then \
		printf "  [OK]    qemu        : %s\n" "$(QEMU_BIN)"; \
	else \
		echo   "  [FALTA] qemu-system-xtensa — ejecuta: make install-qemu"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if $(QEMU_BIN) -machine help 2>&1 | grep -q "esp32"; then \
		echo   "  [OK]    -machine esp32 soportado"; \
	else \
		echo   "  [FALTA] -machine esp32  — ejecuta: make install-qemu"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if $(PYTHON) -c "import serial" 2>/dev/null; then \
		printf "  [OK]    pyserial    : %s\n" "$$($(PYTHON) -c 'import serial; print(serial.__version__)')"; \
	else \
		echo   "  [FALTA] pyserial     — ejecuta: make install-qemu"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if $(PYTHON) -c "import yaml" 2>/dev/null; then \
		echo   "  [OK]    pyyaml"; \
	else \
		echo   "  [FALTA] pyyaml       — ejecuta: make install-qemu"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if [ -d "$(VENV_DIR)" ]; then \
		printf "  [OK]    venv        : %s\n" "$(VENV_DIR)"; \
	else \
		echo   "  [FALTA] venv $(VENV_DIR) — ejecuta: make install-python-deps"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if command -v docker >/dev/null 2>&1; then \
		printf "  [OK]    docker      : %s\n" "$$(docker --version)"; \
	else \
		echo   "  [AVISO] docker no encontrado (necesario para compilar firmware)"; \
	fi; \
	echo ""; \
	if [ "$$ERRORS" -eq 0 ]; then \
		echo "Entorno listo."; \
	else \
		echo "$$ERRORS problema(s) encontrado(s). Resuelve los marcados [FALTA]."; \
		exit 1; \
	fi
	@echo ""

# ==============================================================================
# 10. PIPELINE VIRTUAL (VARIANT-específico)
# ==============================================================================
prepare:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=v7_3001 prepare"; exit 1; }
	@echo "=== Preparando build (variante: $(VARIANT)) ==="
	cd "$(PROJECT_DIR)" && $(PYTHON) -m scripts.f071_preparebuild --variant $(VARIANT)

build:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=v7_3001 build"; exit 1; }
	@echo "=== Compilando firmware (variante: $(VARIANT)) ==="
	cd "$(PROJECT_DIR)" && $(PYTHON) -m scripts.f072_flashrun --variant $(VARIANT) --build-only

start-qemu:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=v7_3001 start-qemu"; exit 1; }
	@[ -d "$(ESP_PROJECT_DIR)/build" ] || { \
		echo "ERROR: No existe $(ESP_PROJECT_DIR)/build"; \
		echo "       Ejecuta primero: make VARIANT=$(VARIANT) build"; \
		exit 1; \
	}
	@[ -f "$(ESP_PROJECT_DIR)/build/flasher_args.json" ] || { \
		echo "ERROR: No existe $(ESP_PROJECT_DIR)/build/flasher_args.json"; \
		exit 1; \
	}
	@mkdir -p $(PID_DIR)
	@if [ -f $(SOCAT_PID) ] && kill -0 $$(cat $(SOCAT_PID)) 2>/dev/null; then \
		echo "[socat] Ya corriendo (PID $$(cat $(SOCAT_PID)))"; \
	else \
		echo "[socat] Creando $(VIRTUAL_PORT) -> TCP $(SOCAT_PORT)..."; \
		sudo socat \
			pty,link=$(VIRTUAL_PORT),raw,echo=0,ignoreeof \
			tcp-listen:$(SOCAT_PORT),reuseaddr \
			>> $(PID_DIR)/socat.log 2>&1 & \
		echo $$! > $(SOCAT_PID); \
		sleep 1; \
		sudo chmod 666 $(VIRTUAL_PORT) 2>/dev/null || true; \
		echo "[socat] PID=$$(cat $(SOCAT_PID))  puerto=$(VIRTUAL_PORT)  TCP=$(SOCAT_PORT)"; \
	fi
	@if [ -f $(QEMU_PID) ] && kill -0 $$(cat $(QEMU_PID)) 2>/dev/null; then \
		echo "[QEMU]  Ya corriendo (PID $$(cat $(QEMU_PID)))"; \
	else \
		echo "[QEMU]  Lanzando emulador ESP32..."; \
		$(QEMU_BIN) -nographic \
			-machine esp32 \
			-drive file=$(ESP_PROJECT_DIR)/build/flasher_args.json,if=mtd,format=raw \
			-serial tcp:127.0.0.1:$(SOCAT_PORT) \
			>> $(PID_DIR)/qemu.log 2>&1 & \
		echo $$! > $(QEMU_PID); \
		sleep 2; \
		if kill -0 $$(cat $(QEMU_PID)) 2>/dev/null; then \
			echo "[QEMU]  PID=$$(cat $(QEMU_PID))  log=$(PID_DIR)/qemu.log"; \
		else \
			echo "[QEMU]  ERROR: el proceso terminó inmediatamente. Revisa:"; \
			cat $(PID_DIR)/qemu.log; \
			rm -f $(QEMU_PID); \
			exit 1; \
		fi; \
	fi
	@echo ""
	@echo "Entorno virtual activo:"
	@echo "  Puerto serie virtual : $(VIRTUAL_PORT)"
	@echo "  Puerto TCP socat     : $(SOCAT_PORT)"
	@echo "  Log QEMU             : $(PID_DIR)/qemu.log"
	@echo "  Siguiente paso       : make VARIANT=$(VARIANT) run"
	@echo ""

stop-qemu:
	@echo "=== Parando entorno virtual QEMU ==="
	@if [ -f $(QEMU_PID) ]; then \
		PID=$$(cat $(QEMU_PID)); \
		if kill -0 $$PID 2>/dev/null; then \
			kill $$PID; echo "[QEMU]  Detenido (PID $$PID)"; \
		else \
			echo "[QEMU]  Ya estaba parado"; \
		fi; \
		rm -f $(QEMU_PID); \
	else \
		pkill -f "qemu-system-xtensa.*esp32" 2>/dev/null && \
			echo "[QEMU]  Detenido por nombre de proceso" || \
			echo "[QEMU]  No hay proceso activo"; \
	fi
	@if [ -f $(SOCAT_PID) ]; then \
		PID=$$(cat $(SOCAT_PID)); \
		if kill -0 $$PID 2>/dev/null; then \
			sudo kill $$PID; echo "[socat] Detenido (PID $$PID)"; \
		else \
			echo "[socat] Ya estaba parado"; \
		fi; \
		rm -f $(SOCAT_PID); \
	else \
		sudo pkill -f "socat.*$(VIRTUAL_PORT)" 2>/dev/null && \
			echo "[socat] Detenido por nombre de proceso" || \
			echo "[socat] No hay proceso activo"; \
	fi
	@sudo rm -f $(VIRTUAL_PORT) 2>/dev/null || true
	@echo "=== QEMU parado ==="

run:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=v7_3001 run"; exit 1; }
	@if [ ! -f $(SOCAT_PID) ] || ! kill -0 $$(cat $(SOCAT_PID)) 2>/dev/null; then \
		echo "ERROR: socat no está corriendo. Ejecuta primero: make VARIANT=$(VARIANT) start-qemu"; \
		exit 1; \
	fi
	@echo "=== Ejecutando pipeline de validación (variante: $(VARIANT)) ==="
	@echo "    Puerto serie : $(VIRTUAL_PORT)   (--skip-flash, modo memoria)"
	cd "$(PROJECT_DIR)" && $(PYTHON) -m scripts.f072_flashrun \
		--variant $(VARIANT) \
		--mode memory \
		--port $(VIRTUAL_PORT) \
		--skip-flash

post:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=v7_3001 post"; exit 1; }
	@echo "=== Análisis post-ejecución (variante: $(VARIANT)) ==="
	cd "$(PROJECT_DIR)" && $(PYTHON) -m scripts.f073_post --variant $(VARIANT)
