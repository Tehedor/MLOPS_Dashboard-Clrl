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
SUBDOMAIN     ?= terminalESP
PORT          ?= 7681
TUNNEL_NAME   ?= runner-esp32-tunnel2
TERMINAL_USER ?= admin
TERMINAL_PASS ?= tu_clave_segura
RUN_USER      ?= runner

# Python venv (espeja la ruta del Dockerfile)
VENV_DIR      ?= /opt/.venv

# GitHub Runner
RUNNER_DIR    ?= /home/$(RUN_USER)/actions-runner
GITHUB_URL    ?= https://github.com/Tehedor/MLOps_actions_v2
GITHUB_TOKEN  ?= AYIURPQROSPWEDBEWMVVPATKCV5OK
RUNNER_NAME   ?= MLOPSRunner1
RUNNER_LABELS ?= "self-hosted-tehelab,mlops,tfm"
RUNNER_VER    ?= 2.334.0
RUNNER_HASH   ?= 048024cd2c848eb6f14d5646d56c13a4def2ae7ee3ad12122bee960c56f3d271

# ==============================================================================
# RUTAS DINÁMICAS (No tocar)
# ==============================================================================
PROJECT_DIR   := $(shell pwd)
CLOUDFLARED   := $(shell which cloudflared)
TTYD          := $(shell which ttyd)
FULL_FQDN     := $(SUBDOMAIN).$(DOMAIN)
export PROJECT_DIR CLOUDFLARED TTYD FULL_FQDN

.PHONY: help setup install start stop status logs clean \
        install-deps install-sys-deps install-python-deps configure-venv-path \
        install-ttyd start-ttyd stop-ttyd status-ttyd logs-ttyd logs-live-ttyd clean-ttyd \
        install-tunnel start-tunnel stop-tunnel status-tunnel logs-tunnel logs-live-tunnel clean-tunnel \
        install-runner start-runner stop-runner status-runner clean-runner \
        logs-runner logs-live-runner logs-live daemon-reload

help:
	@echo "🛠️ Panel de Control MLOps (TTYD + CF Tunnel + GitHub Runner)"
	@echo "---------------------------------------------------------"
	@echo "COMANDOS GLOBALES:"
	@echo "  make setup              - Crea el túnel en CF y genera config.yaml"
	@echo "  make install            - Descarga, configura e instala todos los servicios"
	@echo "  make start              - Inicia todos los servicios"
	@echo "  make stop               - Detiene todos los servicios"
	@echo "  make status             - Estado de todos los servicios"
	@echo "  make logs               - Logs estáticos de todo el stack"
	@echo "  make logs-live          - 🔴 Logs EN VIVO combinados (TTYD + Tunnel)"
	@echo "  make clean              - Borra toda la infraestructura"
	@echo ""
	@echo "DEPENDENCIAS DEL ENTORNO:"
	@echo "  make install-deps         - Sistema + Python + PATH del venv (todo)"
	@echo "  make install-sys-deps     - Solo paquetes apt (git, gh, curl...)"
	@echo "  make install-python-deps  - Solo venv + pip + requirements.txt"
	@echo "  make configure-venv-path  - Expone el venv al runner (profile.d + systemd)"

# ==============================================================================
# 0. DEPENDENCIAS DEL ENTORNO (Sistema + Python)
# ==============================================================================
install-sys-deps:
	@echo "📦 Instalando paquetes del sistema..."
	@sudo apt-get update && sudo apt-get install -y --no-install-recommends \
		git make procps util-linux curl ca-certificates gnupg
	@echo "🔑 Añadiendo repositorio GitHub CLI..."
	@sudo mkdir -p /etc/apt/keyrings
	@curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
		| sudo gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
	@sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
	@echo "deb [arch=$$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
		| sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
	@sudo apt-get update && sudo apt-get install -y --no-install-recommends gh
	@sudo rm -rf /var/lib/apt/lists/*
	@echo "✅ Paquetes del sistema instalados."

install-python-deps:
	@echo "🐍 Creando venv en $(VENV_DIR)..."
	@sudo mkdir -p $(VENV_DIR) && sudo chown $$(whoami) $(VENV_DIR)
	@python3.11 -m venv $(VENV_DIR)
	@echo "📦 Instalando dependencias Python..."
	@$(VENV_DIR)/bin/pip install --upgrade pip "setuptools>=68,<81" wheel
	@$(VENV_DIR)/bin/pip install -r $(PROJECT_DIR)/requirements.txt
	@echo "🧹 Limpiando cachés del venv..."
	@find $(VENV_DIR) -type f -name "*.pyc" -delete
	@find $(VENV_DIR) -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
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
# 1. SETUP
# ==============================================================================
setup:
	@echo "🚀 Comprobando túnel para $(FULL_FQDN)..."
	@$(CLOUDFLARED) tunnel create $(TUNNEL_NAME) >/dev/null 2>&1 || echo "ℹ️ El túnel ya existe en Cloudflare, reutilizando identidad..."
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
# 2. COMANDOS DE TTYD (Terminal Web)
# ==============================================================================
install-ttyd:
	@echo "⚙️ Instalando ttyd.service..."
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
# 3. COMANDOS DE CLOUDFLARE TUNNEL
# ==============================================================================
install-tunnel:
	@echo "⚙️ Instalando cftunnel.service..."
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
	@echo "🗑️ Limpiando configuración local de Cloudflare..."
	@sudo systemctl disable cftunnel.service >/dev/null 2>&1 || true
	@sudo rm -f /etc/systemd/system/cftunnel.service
	@echo "🧹 Desvinculando ruta DNS para evitar bloqueos..."
	@$(CLOUDFLARED) tunnel route dns delete $(TUNNEL_NAME) $(FULL_FQDN) >/dev/null 2>&1 || true
	@rm -f $(PROJECT_DIR)/config.yaml
	@echo "✅ Lado local e histórico de DNS limpios."

# clean-tunnel-d:
# 	@echo "☁️  Desvinculando la ruta DNS en Cloudflare..."
# 	@echo "⚠️  Eliminando ruta DNS: $(TUNNEL_NAME) - $(FULL_FQDN)"
# 	@$(CLOUDFLARED) tunnel route dns delete $(TUNNEL_NAME) $(FULL_FQDN) >/dev/null 2>&1 || echo "⚠️  Aviso: No se pudo desvincular el DNS (quizás ya no existía)."
# 	@echo "☁️  Eliminando identidad del túnel en la nube de Cloudflare..."
# 	@$(CLOUDFLARED) tunnel delete -f $(TUNNEL_NAME) || echo "⚠️  Aviso: No se pudo borrar el túnel (quizás ya no existía)."
# 	@rm -f $(PROJECT_DIR)/config.yaml


# ==============================================================================
# 4. COMANDOS GITHUB RUNNER (Descarga, Registro y Servicio)
# ==============================================================================
install-runner:
	@echo "⚙️ Descargando e instalando dependencias del GitHub Runner..."
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
	@echo "⚙️ Configurando el servicio systemd del Runner..."
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
# 5. COMANDOS GLOBALES (Orquestadores)
# ==============================================================================
daemon-reload:
	@sudo systemctl daemon-reload
	@sudo systemctl enable ttyd.service cftunnel.service >/dev/null 2>&1 || true

install: install-ttyd install-tunnel install-runner daemon-reload
	@echo "✅ Toda la infraestructura (Terminal, Túnel y Runner) generada e instalada."

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