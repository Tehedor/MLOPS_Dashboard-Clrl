# ==============================================================================
# CARGA DE VARIABLES (.env)
# ==============================================================================
# Si el archivo .env existe, lo importamos y exportamos las variables
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# ==============================================================================
# VALORES POR DEFECTO (Fallback si no existe .env)
# ==============================================================================
DOMAIN        ?= *****.com
SUBDOMAIN     ?= terminalESP
PORT          ?= 7681
TUNNEL_NAME   ?= runner-esp32-tunnel2
TERMINAL_USER ?= admin
TERMINAL_PASS ?= tu_clave_segura
RUN_USER      ?= runner

# ==============================================================================
# RUTAS DINÁMICAS (No tocar)
# ==============================================================================
PROJECT_DIR   := $(shell pwd)
CLOUDFLARED   := $(shell which cloudflared)
TTYD          := $(shell which ttyd)
FULL_FQDN     := $(SUBDOMAIN).$(DOMAIN)
export PROJECT_DIR CLOUDFLARED TTYD FULL_FQDN

# Definimos todos los comandos disponibles para evitar conflictos con archivos
.PHONY: help setup install start stop status logs clean \
        install-ttyd start-ttyd stop-ttyd status-ttyd logs-ttyd clean-ttyd \
        install-tunnel start-tunnel stop-tunnel status-tunnel logs-tunnel clean-tunnel \
        daemon-reload

help:
	@echo "🛠️ Panel de Control Modular (TTYD + Cloudflare Tunnel)"
	@echo "---------------------------------------------------------"
	@echo "COMANDOS GLOBALES:"
	@echo "  make setup    - Crea el túnel en CF y genera config.yaml"
	@echo "  make install  - Genera e instala todos los servicios"
	@echo "  make start    - Inicia todos los servicios"
	@echo "  make stop     - Detiene todos los servicios"
	@echo "  make status   - Estado de todos los servicios"
	@echo "  make logs     - Logs de todos los servicios"
	@echo "  make clean    - Borra toda la infraestructura"
	@echo "---------------------------------------------------------"
	@echo "COMANDOS INDIVIDUALES (Añade -ttyd o -tunnel al comando):"
	@echo "  Ejemplo: make start-ttyd, make logs-tunnel, make stop-ttyd"

# ==============================================================================
# 1. SETUP (Configuración inicial de Cloudflare)
# ==============================================================================
setup:
	@echo "🚀 Configurando túnel para $(FULL_FQDN)..."
	@$(CLOUDFLARED) tunnel create $(TUNNEL_NAME) >/dev/null 2>&1 || true
	@$(CLOUDFLARED) tunnel route dns $(TUNNEL_NAME) $(FULL_FQDN) >/dev/null 2>&1 || true
	@$(eval TUNNEL_ID := $(shell $(CLOUDFLARED) tunnel list | grep "$(TUNNEL_NAME)" | head -n 1 | sed 's/[[:space:]].*//'))
	@if [ -z "$(TUNNEL_ID)" ]; then echo "❌ Error: No se pudo obtener el ID del túnel."; exit 1; fi
	@echo "✅ Túnel ID: $(TUNNEL_ID)"
	@echo "📝 Generando config.yaml..."
	@sed -e 's|__TUNNEL_ID__|$(TUNNEL_ID)|g' \
	     -e 's|__RUN_USER__|$(RUN_USER)|g' \
	     -e 's|__FULL_FQDN__|$(FULL_FQDN)|g' \
	     -e 's|__PORT__|$(PORT)|g' \
	     templates/config.yaml.tpl > $(PROJECT_DIR)/config.yaml
	@echo "✅ config.yaml generado."

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

clean-tunnel: stop-tunnel
	@echo "🗑️  Limpiando Cloudflare Tunnel..."
	@sudo systemctl disable cftunnel.service >/dev/null 2>&1 || true
	@sudo rm -f /etc/systemd/system/cftunnel.service
	@$(CLOUDFLARED) tunnel delete -f $(TUNNEL_NAME) >/dev/null 2>&1 || true
	@rm -f $(PROJECT_DIR)/config.yaml

# ==============================================================================
# 4. COMANDOS GLOBALES (Orquestadores)
# ==============================================================================
daemon-reload:
	@sudo systemctl daemon-reload
	@sudo systemctl enable ttyd.service cftunnel.service >/dev/null 2>&1 || true

# Ejecutan los comandos individuales en secuencia
install: install-ttyd install-tunnel daemon-reload
	@echo "✅ Todos los servicios generados e instalados."

start: start-ttyd start-tunnel
stop: stop-ttyd stop-tunnel
status: status-ttyd status-tunnel
logs: logs-ttyd logs-tunnel

clean: clean-ttyd clean-tunnel
	@sudo systemctl daemon-reload
	@echo "✅ Limpieza global completada."