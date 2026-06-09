# ==============================================================================
# ESP32 Virtual Runner
# Entorno HIL puramente en software: socat (puerto serie virtual) + QEMU ESP32
#
# Uso rápido:
#   make install                         instala dependencias (auto-detecta distro)
#   make verify                          verifica que el entorno está listo
#   make VARIANT=<v> build               compila firmware (idf.py vía Docker)
#   make VARIANT=<v> start               lanza socat + QEMU en background
#   make VARIANT=<v> run                 ejecuta pipeline de validación (sin flasheo)
#   make stop                            para socat y QEMU
#   make VARIANT=<v> post                análisis post-ejecución (f073)
# ==============================================================================

# -- Configuración -------------------------------------------------------------
VARIANT          ?=
RUNNER_DIR       := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
PYTHON           ?= python3
SOCAT_PORT       ?= 4000
VIRTUAL_PORT     ?= /dev/ttyVUSB0
QEMU_INSTALL_DIR ?= /opt/qemu-esp32

# qemu-system-xtensa: usa /opt/qemu-esp32 si existe, si no el del PATH
QEMU_BIN := $(shell \
	if [ -x "$(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa" ]; then \
		echo "$(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa"; \
	else \
		command -v qemu-system-xtensa 2>/dev/null || echo "qemu-system-xtensa"; \
	fi)

# Directorio del proyecto ESP32 generado por f071 para la variante
ESP_PROJECT_DIR ?= $(RUNNER_DIR)executions/f07_modval/$(VARIANT)/esp32_project

# PIDs de los procesos en background
PID_DIR    := /tmp/esp32-virt
SOCAT_PID  := $(PID_DIR)/socat.pid
QEMU_PID   := $(PID_DIR)/qemu.pid

# Registro de lo instalado por este Makefile
STATE_FILE := $(RUNNER_DIR).install-state

.PHONY: help install install-arch install-debian \
        install-qemu-esp32 install-qemu-esp32-build-deps \
        snapshot uninstall \
        verify start stop build run post

# ==============================================================================
# HELP
# ==============================================================================
help:
	@echo ""
	@echo "ESP32 Virtual Runner"
	@echo "------------------------------------------------------------"
	@echo "SETUP:"
	@echo "  make install                   Instala dependencias (auto-detecta distro)"
	@echo "  make install-arch              Dependencias para Arch Linux"
	@echo "  make install-debian            Dependencias para Debian/Ubuntu"
	@echo "  make install-qemu-esp32        Compila e instala fork QEMU de Espressif"
	@echo "  make snapshot                  Registra estado actual del sistema en .install-state"
	@echo "  make uninstall                 Elimina solo lo instalado por este Makefile"
	@echo "  make verify                    Verifica que el entorno está completo"
	@echo ""
	@echo "FLUJO:"
	@echo "  make VARIANT=<v> build         Compila firmware (build-only, idf.py via Docker)"
	@echo "  make VARIANT=<v> start         Lanza socat + QEMU en background"
	@echo "  make stop                      Para socat y QEMU"
	@echo "  make VARIANT=<v> run           Ejecuta pipeline de validación (--skip-flash)"
	@echo "  make VARIANT=<v> post          Análisis post-ejecución (f073)"
	@echo ""
	@echo "VARIABLES:"
	@echo "  VARIANT           Nombre de la variante (requerido para build/start/run/post)"
	@echo "  SOCAT_PORT        Puerto TCP socat <-> QEMU (default: $(SOCAT_PORT))"
	@echo "  VIRTUAL_PORT      Puerto serie virtual (default: $(VIRTUAL_PORT))"
	@echo "  QEMU_INSTALL_DIR  Instalación fork QEMU Espressif (default: $(QEMU_INSTALL_DIR))"
	@echo "  ESP_PROJECT_DIR   Proyecto ESP32 compilado (default: auto desde VARIANT)"
	@echo ""

# ==============================================================================
# SNAPSHOT — registra qué estaba instalado antes de este Makefile
# Preserva los valores INST_ si el fichero ya existe.
# ==============================================================================
snapshot:
	@INST_SOCAT=false; INST_PYSERIAL=false; INST_QEMU_ESP32=false; \
	QEMU_PATH=$(QEMU_INSTALL_DIR); \
	if [ -f $(STATE_FILE) ]; then \
		V=$$(grep "^INST_SOCAT=" $(STATE_FILE) | cut -d= -f2); [ -n "$$V" ] && INST_SOCAT=$$V; \
		V=$$(grep "^INST_PYSERIAL=" $(STATE_FILE) | cut -d= -f2); [ -n "$$V" ] && INST_PYSERIAL=$$V; \
		V=$$(grep "^INST_QEMU_ESP32=" $(STATE_FILE) | cut -d= -f2); [ -n "$$V" ] && INST_QEMU_ESP32=$$V; \
		V=$$(grep "^INST_QEMU_ESP32_PATH=" $(STATE_FILE) | cut -d= -f2); [ -n "$$V" ] && QEMU_PATH=$$V; \
	fi; \
	DISTRO=unknown; \
	command -v pacman   >/dev/null 2>&1 && DISTRO=arch; \
	command -v apt-get  >/dev/null 2>&1 && DISTRO=debian; \
	{ \
	  echo "# ESP32 Virtual Runner — Install State"; \
	  echo "# 'make snapshot' regenera PRE_. 'make uninstall' deshace solo INST_=true con PRE_=false."; \
	  echo "DISTRO=$$DISTRO"; \
	  echo "CREATED_AT=$$(date +%Y-%m-%d)"; \
	  echo ""; \
	  echo "# Pre-existentes antes de este Makefile (no se tocan en uninstall)"; \
	  command -v socat >/dev/null 2>&1 \
	    && echo "PRE_SOCAT=true" || echo "PRE_SOCAT=false"; \
	  $(PYTHON) -c "import yaml" 2>/dev/null \
	    && echo "PRE_PYYAML=true" || echo "PRE_PYYAML=false"; \
	  command -v docker >/dev/null 2>&1 \
	    && echo "PRE_DOCKER=true" || echo "PRE_DOCKER=false"; \
	  $(PYTHON) -c "import serial" 2>/dev/null \
	    && echo "PRE_PYSERIAL=true" || echo "PRE_PYSERIAL=false"; \
	  { command -v qemu-system-xtensa >/dev/null 2>&1 && \
	    qemu-system-xtensa -machine help 2>&1 | grep -q "esp32"; } \
	    && echo "PRE_QEMU_ESP32=true" || echo "PRE_QEMU_ESP32=false"; \
	  echo ""; \
	  echo "# Instalado por este Makefile (actualizado automáticamente)"; \
	  echo "INST_SOCAT=$$INST_SOCAT"; \
	  echo "INST_PYSERIAL=$$INST_PYSERIAL"; \
	  echo "INST_QEMU_ESP32=$$INST_QEMU_ESP32"; \
	  echo "INST_QEMU_ESP32_PATH=$$QEMU_PATH"; \
	} > $(STATE_FILE)
	@echo "Estado guardado en $(STATE_FILE)"

# ==============================================================================
# UNINSTALL — elimina solo lo que instaló este Makefile
# ==============================================================================
uninstall:
	@[ -f $(STATE_FILE) ] || { echo "ERROR: no existe $(STATE_FILE). Nada que desinstalar."; exit 1; }
	@echo "=== Desinstalando componentes instalados por este Makefile ==="
	@. $(STATE_FILE); \
	if [ "$$INST_QEMU_ESP32" = "true" ] && [ "$$PRE_QEMU_ESP32" = "false" ]; then \
		echo "[QEMU] Eliminando fork Espressif: $$INST_QEMU_ESP32_PATH"; \
		sudo rm -rf "$$INST_QEMU_ESP32_PATH"; \
		sed -i 's/^INST_QEMU_ESP32=.*/INST_QEMU_ESP32=false/' $(STATE_FILE); \
	else \
		echo "[QEMU] Nada que eliminar (no fue instalado por este Makefile)"; \
	fi; \
	if [ "$$INST_PYSERIAL" = "true" ] && [ "$$PRE_PYSERIAL" = "false" ]; then \
		echo "[pyserial] Desinstalando..."; \
		if [ "$$DISTRO" = "arch" ]; then \
			sudo pacman -R --noconfirm python-pyserial 2>/dev/null || \
			$(PYTHON) -m pip uninstall -y pyserial; \
		else \
			sudo apt-get remove -y python3-serial 2>/dev/null || \
			$(PYTHON) -m pip uninstall -y pyserial; \
		fi; \
		sed -i 's/^INST_PYSERIAL=.*/INST_PYSERIAL=false/' $(STATE_FILE); \
	else \
		echo "[pyserial] Nada que eliminar (no fue instalado por este Makefile)"; \
	fi; \
	if [ "$$INST_SOCAT" = "true" ] && [ "$$PRE_SOCAT" = "false" ]; then \
		echo "[socat] Desinstalando..."; \
		if [ "$$DISTRO" = "arch" ]; then \
			sudo pacman -R --noconfirm socat; \
		else \
			sudo apt-get remove -y socat; \
		fi; \
		sed -i 's/^INST_SOCAT=.*/INST_SOCAT=false/' $(STATE_FILE); \
	else \
		echo "[socat] Nada que eliminar (pre-existente o no instalado por este Makefile)"; \
	fi
	@echo "=== Desinstalacion completada ==="

# ==============================================================================
# INSTALACIÓN — auto-detecta distro
# ==============================================================================
install:
	@if command -v pacman >/dev/null 2>&1; then \
		$(MAKE) install-arch; \
	elif command -v apt-get >/dev/null 2>&1; then \
		$(MAKE) install-debian; \
	else \
		echo "ERROR: Distro no reconocida. Usa 'make install-arch' o 'make install-debian'."; \
		exit 1; \
	fi

# -- Arch Linux ----------------------------------------------------------------
install-arch:
	@[ -f $(STATE_FILE) ] || $(MAKE) snapshot
	@echo "[Arch] Instalando dependencias del sistema..."
	@PRE_SOCAT=$$(grep "^PRE_SOCAT=" $(STATE_FILE) | cut -d= -f2); \
	sudo pacman -Sy --noconfirm --needed socat python python-pip; \
	[ "$$PRE_SOCAT" = "false" ] && sed -i 's/^INST_SOCAT=.*/INST_SOCAT=true/' $(STATE_FILE) || true
	@PRE_PYSERIAL=$$(grep "^PRE_PYSERIAL=" $(STATE_FILE) | cut -d= -f2); \
	$(PYTHON) -m pip install --user pyserial pyyaml 2>/dev/null || \
		sudo pacman -S --noconfirm --needed python-pyserial python-yaml; \
	[ "$$PRE_PYSERIAL" = "false" ] && sed -i 's/^INST_PYSERIAL=.*/INST_PYSERIAL=true/' $(STATE_FILE) || true
	@echo "[Arch] Verificando soporte -machine esp32..."
	@if command -v qemu-system-xtensa >/dev/null 2>&1 && \
		qemu-system-xtensa -machine help 2>&1 | grep -q "esp32"; then \
		echo "[Arch] OK: qemu-system-xtensa del sistema soporta esp32"; \
	else \
		echo "[Arch] qemu-system-xtensa no soporta esp32. Compilando fork Espressif..."; \
		sudo pacman -S --noconfirm --needed base-devel git ninja python pkg-config \
			glib2 pixman libslirp; \
		$(MAKE) install-qemu-esp32; \
	fi
	@echo "[Arch] Instalacion completada."

# -- Debian / Ubuntu -----------------------------------------------------------
install-debian:
	@[ -f $(STATE_FILE) ] || $(MAKE) snapshot
	@echo "[Debian] Instalando dependencias del sistema..."
	@PRE_SOCAT=$$(grep "^PRE_SOCAT=" $(STATE_FILE) | cut -d= -f2); \
	PRE_PYSERIAL=$$(grep "^PRE_PYSERIAL=" $(STATE_FILE) | cut -d= -f2); \
	sudo apt-get update -qq && \
	sudo apt-get install -y --no-install-recommends \
		socat python3 python3-pip python3-serial python3-yaml; \
	[ "$$PRE_SOCAT"    = "false" ] && sed -i 's/^INST_SOCAT=.*/INST_SOCAT=true/'       $(STATE_FILE) || true; \
	[ "$$PRE_PYSERIAL" = "false" ] && sed -i 's/^INST_PYSERIAL=.*/INST_PYSERIAL=true/' $(STATE_FILE) || true
	@echo "[Debian] Verificando soporte -machine esp32..."
	@if command -v qemu-system-xtensa >/dev/null 2>&1 && \
		qemu-system-xtensa -machine help 2>&1 | grep -q "esp32"; then \
		echo "[Debian] OK: qemu-system-xtensa del sistema soporta esp32"; \
	else \
		echo "[Debian] qemu-system-xtensa no soporta esp32. Compilando fork Espressif..."; \
		$(MAKE) install-qemu-esp32-build-deps; \
		$(MAKE) install-qemu-esp32; \
	fi
	@echo "[Debian] Instalacion completada."

install-qemu-esp32-build-deps:
	sudo apt-get install -y --no-install-recommends \
		git build-essential ninja-build cmake pkg-config \
		libglib2.0-dev libpixman-1-dev libslirp-dev

# -- Fork QEMU de Espressif (necesario para -machine esp32) -------------------
install-qemu-esp32:
	@echo "Compilando fork QEMU de Espressif (xtensa-softmmu)..."
	@echo "Esto puede tardar 10-20 minutos."
	@if [ -x "$(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa" ]; then \
		echo "Ya instalado: $(QEMU_INSTALL_DIR)/bin/qemu-system-xtensa"; \
		exit 0; \
	fi
	@TMPDIR=$$(mktemp -d /tmp/qemu-esp32-XXXXXX); \
	git clone --depth=1 https://github.com/espressif/qemu.git "$$TMPDIR" && \
	cd "$$TMPDIR" && \
	./configure \
		--target-list=xtensa-softmmu \
		--prefix="$(QEMU_INSTALL_DIR)" \
		--disable-werror \
		--disable-docs && \
	ninja -C build && \
	sudo ninja -C build install && \
	rm -rf "$$TMPDIR"
	@echo "QEMU ESP32 instalado en $(QEMU_INSTALL_DIR)/bin/"
	@echo "Opcional: añade $(QEMU_INSTALL_DIR)/bin a tu PATH."
	@[ -f $(STATE_FILE) ] || $(MAKE) snapshot
	@sed -i 's/^INST_QEMU_ESP32=.*/INST_QEMU_ESP32=true/' $(STATE_FILE)
	@sed -i 's|^INST_QEMU_ESP32_PATH=.*|INST_QEMU_ESP32_PATH=$(QEMU_INSTALL_DIR)|' $(STATE_FILE)

# ==============================================================================
# VERIFY — comprueba que todo está instalado y operativo
# ==============================================================================
verify:
	@echo ""
	@echo "=== Verificacion del entorno ESP32 virtual ==="
	@ERRORS=0; \
	if command -v socat >/dev/null 2>&1; then \
		printf "  [OK]    socat       : %s\n" "$$(socat -V 2>&1 | head -1)"; \
	else \
		echo   "  [FALTA] socat        — ejecuta: make install"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if [ -x "$(QEMU_BIN)" ] || command -v "$(QEMU_BIN)" >/dev/null 2>&1; then \
		printf "  [OK]    qemu        : %s\n" "$(QEMU_BIN)"; \
	else \
		echo   "  [FALTA] qemu-system-xtensa — ejecuta: make install-qemu-esp32"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if $(QEMU_BIN) -machine help 2>&1 | grep -q "esp32"; then \
		echo   "  [OK]    -machine esp32 soportado"; \
	else \
		echo   "  [FALTA] -machine esp32  — ejecuta: make install-qemu-esp32"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if $(PYTHON) -c "import serial" 2>/dev/null; then \
		printf "  [OK]    pyserial    : %s\n" "$$($(PYTHON) -c 'import serial; print(serial.__version__)')"; \
	else \
		echo   "  [FALTA] pyserial     — ejecuta: pip install pyserial"; \
		ERRORS=$$((ERRORS+1)); \
	fi; \
	if $(PYTHON) -c "import yaml" 2>/dev/null; then \
		echo   "  [OK]    pyyaml"; \
	else \
		echo   "  [FALTA] pyyaml       — ejecuta: pip install pyyaml"; \
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
# START — lanza socat + QEMU en background, guarda PIDs
# ==============================================================================
start:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=mi_variante start"; exit 1; }
	@[ -d "$(ESP_PROJECT_DIR)/build" ] || { \
		echo "ERROR: No existe $(ESP_PROJECT_DIR)/build"; \
		echo "       Ejecuta primero: make VARIANT=$(VARIANT) build"; \
		exit 1; \
	}
	@[ -f "$(ESP_PROJECT_DIR)/build/flasher_args.json" ] || { \
		echo "ERROR: No existe $(ESP_PROJECT_DIR)/build/flasher_args.json"; \
		echo "       Asegurate de que el build completo correctamente."; \
		exit 1; \
	}
	@mkdir -p $(PID_DIR)
	@# --- socat: crea /dev/ttyVUSB0 y escucha en TCP 4000 ---
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
	@# --- QEMU: carga flasher_args.json y conecta UART al puerto TCP ---
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
			echo "[QEMU]  ERROR: el proceso termino inmediatamente. Revisa:"; \
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

# ==============================================================================
# STOP — para socat y QEMU, limpia PID files
# ==============================================================================
stop:
	@echo "=== Parando entorno virtual ==="
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
	@echo "=== Parado ==="

# ==============================================================================
# BUILD — compila firmware con idf.py via Docker (build-only, sin flashear)
# ==============================================================================
build:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=mi_variante build"; exit 1; }
	@echo "=== Compilando firmware (variante: $(VARIANT)) ==="
	cd "$(RUNNER_DIR)" && $(PYTHON) -m scripts.f072_flashrun --variant $(VARIANT) --build-only

# ==============================================================================
# RUN — ejecuta pipeline de validación sin flasheo real (usa socat+QEMU)
# ==============================================================================
run:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=mi_variante run"; exit 1; }
	@if [ ! -f $(SOCAT_PID) ] || ! kill -0 $$(cat $(SOCAT_PID)) 2>/dev/null; then \
		echo "ERROR: socat no esta corriendo. Ejecuta primero: make VARIANT=$(VARIANT) start"; \
		exit 1; \
	fi
	@echo "=== Ejecutando pipeline de validacion (variante: $(VARIANT)) ==="
	@echo "    Puerto serie : $(VIRTUAL_PORT)   (--skip-flash activado)"
	cd "$(RUNNER_DIR)" && $(PYTHON) -m scripts.f072_flashrun \
		--variant $(VARIANT) \
		--mode serial \
		--port $(VIRTUAL_PORT) \
		--skip-flash

# ==============================================================================
# POST — análisis post-ejecución (f073)
# ==============================================================================
post:
	@[ -n "$(VARIANT)" ] || { echo "ERROR: VARIANT requerido. Ej: make VARIANT=mi_variante post"; exit 1; }
	@echo "=== Analisis post-ejecucion (variante: $(VARIANT)) ==="
	cd "$(RUNNER_DIR)" && $(PYTHON) -m scripts.f073_post --variant $(VARIANT)
