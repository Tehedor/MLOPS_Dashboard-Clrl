.DEFAULT_GOAL := help

# LOCAL: usa el Python instalado en el sistema.
# VENV:  usa un entorno virtual en .venv/ (se crea al instalar dependencias).
MODE ?= LOCAL

BACKEND_DIR  := backend
FRONTEND_DIR := fronted
PID_DIR      := .pids
VENV_DIR     := .venv

#SYSTEM_PYTHON ?= python3
SYSTEM_PYTHON ?= python

ifeq ($(OS),Windows_NT)
VENV_PYTHON := $(abspath $(VENV_DIR)/Scripts/python.exe)
else
VENV_PYTHON := $(abspath $(VENV_DIR)/bin/python)
endif

ifeq ($(MODE),LOCAL)
PYTHON_CMD  := $(SYSTEM_PYTHON)
PIP_CMD     := $(PYTHON_CMD) -m pip
UVICORN_CMD := $(PYTHON_CMD) -m uvicorn
RUFF_CMD    := $(PYTHON_CMD) -m ruff
else ifeq ($(MODE),VENV)
PYTHON_CMD  := $(VENV_PYTHON)
PIP_CMD     := $(PYTHON_CMD) -m pip
UVICORN_CMD := $(PYTHON_CMD) -m uvicorn
RUFF_CMD    := $(PYTHON_CMD) -m ruff
else
$(error MODE debe ser LOCAL o VENV; valor recibido: $(MODE))
endif

BACKEND_PID  := $(PID_DIR)/backend.pid
FRONTEND_PID := $(PID_DIR)/frontend.pid
BACKEND_LOG  := $(PID_DIR)/backend.log
FRONTEND_LOG := $(PID_DIR)/frontend.log

CYAN  := \033[36m
GREEN := \033[32m
RESET := \033[0m
BOLD  := \033[1m

# ── Help ──────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Muestra esta ayuda
	@printf "\n$(BOLD)MLOps Control Dashboard$(RESET)\n\n"
	@printf "  Modo Python: $(CYAN)$(MODE)$(RESET) ($(PYTHON_CMD))\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-24s$(RESET) %s\n", $$1, $$2}' \
		| sort
	@printf "\n"

# ── Setup ─────────────────────────────────────────────────────────────────────

.PHONY: install install-backend install-frontend python-env env supabase-deploy supabase-redeploy
install: install-backend install-frontend ## Instala todas las dependencias

python-env: ## Prepara Python según MODE (crea .venv si MODE=VENV)
ifeq ($(MODE),VENV)
	@test -x $(PYTHON_CMD) || $(SYSTEM_PYTHON) -m venv $(VENV_DIR)
else
	@command -v $(SYSTEM_PYTHON) >/dev/null || { \
		echo "No se encontró $(SYSTEM_PYTHON) en PATH"; \
		exit 1; \
	}
endif

install-backend: python-env ## Instala dependencias Python según MODE
	cd $(BACKEND_DIR) && $(PIP_CMD) install -r requirements.txt

install-frontend: ## Instala dependencias Node (npm)
	cd $(FRONTEND_DIR) && npm install

env: ## Crea .env desde .env.example (no sobreescribe)
	@[ -f .env ] \
		&& echo ".env ya existe — no se sobreescribe" \
		|| (cp .env.example .env \
			&& printf "$(GREEN).env creado$(RESET) — edítalo y añade GITHUB_TOKEN\n")

supabase-deploy: ## Despliega la Edge Function opcional de Supabase
	@bash scripts/setup_supabase.sh

supabase-redeploy: ## Fuerza redeploy de la Edge Function eliminando el centinela
	@rm -f .supabase/.deployed && bash scripts/setup_supabase.sh

# ── Dev (procesos locales) ────────────────────────────────────────────────────

.PHONY: dev dev-backend dev-frontend
dev: dev-backend wait-backend dev-frontend ## Arranca backend + frontend en background (Supabase no es necesario)
	@printf "\n$(BOLD)Servicios arrancados$(RESET)\n"
	@printf "  Backend:  $(CYAN)http://localhost:8000$(RESET)\n"
	@printf "  Frontend: $(CYAN)http://localhost:5173$(RESET)\n"
	@printf "  API docs: $(CYAN)http://localhost:8000/docs$(RESET)\n"
	@printf "  Logs:     make logs\n\n"

dev-backend: ## Arranca el backend (uvicorn --reload) en background
	@mkdir -p $(PID_DIR); \
	if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then \
		echo "Backend ya corriendo (PID $$(cat $(BACKEND_PID)))"; \
	elif PID=$$(lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | head -n1); [ -n "$$PID" ]; then \
		echo $$PID > $(BACKEND_PID); \
		echo "Backend ya corriendo (PID $$PID)"; \
	else \
		cd $(BACKEND_DIR) || exit 1; \
		$(UVICORN_CMD) app.main:app --reload --port 8000 > ../$(BACKEND_LOG) 2>&1 & \
		PID=$$!; \
		sleep 1; \
		if kill -0 $$PID 2>/dev/null; then \
			echo $$PID > ../$(BACKEND_PID); \
			printf "$(GREEN)Backend arrancado$(RESET) (PID $$PID)\n"; \
		else \
			echo "Backend no pudo arrancar. Revisa: $(BACKEND_LOG)"; \
			tail -n 20 ../$(BACKEND_LOG) 2>/dev/null || true; \
			rm -f ../$(BACKEND_PID); \
			exit 1; \
		fi; \
	fi

wait-backend: ## Espera a que el backend esté listo (health check en /docs)
	@SPINNER=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" ); \
	TIMEOUT=120; \
	ELAPSED=0; \
	printf "$(CYAN)Esperando backend...$(RESET) "; \
	while [ $$ELAPSED -lt $$TIMEOUT ]; do \
		FRAME=$$(( ELAPSED % $${#SPINNER[@]} )); \
		printf "\r$(CYAN)$${SPINNER[$$FRAME]} Esperando backend... ($$ELAPSED/$$TIMEOUT)s$(RESET) "; \
		if curl -sf http://localhost:8000/docs > /dev/null 2>&1; then \
			printf "\r$(GREEN)✓ Backend listo$(RESET)\n"; \
			exit 0; \
		fi; \
		sleep 0.5; \
		ELAPSED=$$(( ELAPSED + 1 )); \
	done; \
	printf "\r$(RESET)"; \
	echo "⚠ Backend no respondió en $$TIMEOUT segundos"; \
	exit 1

dev-frontend: ## Arranca el frontend (vite) en background
	@mkdir -p $(PID_DIR); \
	if [ -f $(FRONTEND_PID) ] && kill -0 $$(cat $(FRONTEND_PID)) 2>/dev/null; then \
		echo "Frontend ya corriendo (PID $$(cat $(FRONTEND_PID)))"; \
	else \
		cd $(FRONTEND_DIR) || exit 1; \
		npm run dev > ../$(FRONTEND_LOG) 2>&1 & \
		echo $$! > ../$(FRONTEND_PID); \
		printf "$(GREEN)Frontend arrancado$(RESET) (PID $$(cat ../$(FRONTEND_PID)))\n"; \
	fi

# ── Stop ─────────────────────────────────────────────────────────────────────

.PHONY: stop stop-backend stop-frontend restart restart-backend restart-frontend
stop: stop-backend stop-frontend ## Para backend + frontend

stop-backend: ## Para el backend
	@PIDS=""; \
	if [ -f $(BACKEND_PID) ]; then \
		PID_FILE=$$(cat $(BACKEND_PID) 2>/dev/null); \
		[ -n "$$PID_FILE" ] && PIDS="$$PID_FILE"; \
	fi; \
	PORT_PID=$$(lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | head -n1); \
	if [ -n "$$PORT_PID" ]; then \
		case " $$PIDS " in \
			*" $$PORT_PID "*) ;; \
			*) PIDS="$$PIDS $$PORT_PID" ;; \
		esac; \
	fi; \
	for PID in $$(pgrep -f "uvicorn app.main:app --reload --port 8000" 2>/dev/null || true); do \
		COMM=$$(ps -p $$PID -o comm= 2>/dev/null | tr -d '[:space:]'); \
		ARGS=$$(ps -p $$PID -o args= 2>/dev/null); \
		case "$$COMM" in sh|bash|dash|make) continue ;; esac; \
		printf "%s" "$$ARGS" | grep -q "uvicorn app.main:app --reload --port 8000" || continue; \
		case " $$PIDS " in \
			*" $$PID "*) ;; \
			*) PIDS="$$PIDS $$PID" ;; \
		esac; \
	done; \
	if [ -n "$$(printf "%s" "$$PIDS" | tr -d '[:space:]')" ]; then \
		for PID in $$PIDS; do kill $$PID 2>/dev/null || true; done; \
		for _ in 1 2 3 4 5; do \
			ALIVE=0; \
			for PID in $$PIDS; do kill -0 $$PID 2>/dev/null && ALIVE=1; done; \
			[ $$ALIVE -eq 0 ] && break; \
			sleep 0.2; \
		done; \
		for PID in $$PIDS; do kill -0 $$PID 2>/dev/null && kill -9 $$PID 2>/dev/null || true; done; \
		echo "Backend parado (PIDs:$${PIDS})"; \
	else \
		echo "Backend no estaba corriendo"; \
	fi; \
	rm -f $(BACKEND_PID)

stop-frontend: ## Para el frontend
	@if [ -f $(FRONTEND_PID) ]; then \
		PID=$$(cat $(FRONTEND_PID)); \
		kill $$PID 2>/dev/null && echo "Frontend parado (PID $$PID)" || echo "Frontend ya estaba parado"; \
		rm -f $(FRONTEND_PID); \
	else \
		echo "Frontend no estaba corriendo"; \
	fi

restart: stop dev ## Reinicia backend + frontend
restart-backend: stop-backend dev-backend ## Reinicia solo el backend
restart-frontend: stop-frontend dev-frontend ## Reinicia solo el frontend

# ── Status & Logs ─────────────────────────────────────────────────────────────

.PHONY: status logs logs-backend logs-frontend logs-localRunner
status: ## Estado de los procesos locales
	@B_STATUS="STOPPED"; F_STATUS="STOPPED"; \
	[ -f $(BACKEND_PID) ]  && kill -0 $$(cat $(BACKEND_PID))  2>/dev/null \
		&& B_STATUS="$(GREEN)RUNNING$(RESET) (PID $$(cat $(BACKEND_PID)))"; \
	if [ "$$B_STATUS" = "STOPPED" ]; then \
		PID=$$(lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | head -n1); \
		if [ -n "$$PID" ]; then \
			echo $$PID > $(BACKEND_PID); \
			B_STATUS="$(GREEN)RUNNING$(RESET) (PID $$PID)"; \
		fi; \
	fi; \
	[ -f $(FRONTEND_PID) ] && kill -0 $$(cat $(FRONTEND_PID)) 2>/dev/null \
		&& F_STATUS="$(GREEN)RUNNING$(RESET) (PID $$(cat $(FRONTEND_PID)))"; \
	printf "  Backend:  $$B_STATUS\n"; \
	printf "  Frontend: $$F_STATUS\n"

logs: ## Sigue los logs de ambos servicios (Ctrl-C para salir)
	@[ -f $(BACKEND_LOG) ] || [ -f $(FRONTEND_LOG) ] \
		|| (echo "No hay logs todavía. Arranca con: make dev" && exit 1)
	@tail -f $(BACKEND_LOG) $(FRONTEND_LOG) 2>/dev/null

logs-backend: ## Sigue los logs del backend
	@tail -f $(BACKEND_LOG)

logs-frontend: ## Sigue los logs del frontend
	@tail -f $(FRONTEND_LOG)

logs-localRunner: ## Logs del runner local en tiempo real (EXEC=<id_prefix> para uno específico)
	@$(PYTHON_CMD) scripts/local_runner_logs.py $(EXEC)

# ── Docker ────────────────────────────────────────────────────────────────────

.PHONY: docker-up docker-up-build docker-down docker-build \
        docker-logs docker-restart docker-ps docker-shell-backend

docker-up: ## Levanta todos los servicios con Docker Compose (detached)
	docker compose up -d

docker-up-build: ## Build + up (fuerza rebuild de imágenes)
	docker compose up -d --build

docker-down: ## Para y elimina los contenedores
	docker compose down

docker-build: ## Construye las imágenes sin levantar
	docker compose build

docker-logs: ## Sigue los logs de Docker Compose
	docker compose logs -f

docker-restart: docker-down docker-up ## Para y vuelve a levantar los contenedores

docker-ps: ## Estado de los contenedores Docker
	docker compose ps

docker-shell-backend: ## Shell interactivo en el contenedor backend
	docker compose exec backend bash

# ── DB ────────────────────────────────────────────────────────────────────────

.PHONY: db-reset db-shell db-dump
db-reset: ## Elimina la base de datos SQLite (requiere restart del backend)
	@rm -f $(BACKEND_DIR)/executions.db && printf "$(GREEN)Base de datos eliminada$(RESET)\n"

db-shell: ## Abre shell SQLite interactivo
	sqlite3 $(BACKEND_DIR)/executions.db

db-dump: ## Vuelca toda la tabla executions a stdout
	@sqlite3 $(BACKEND_DIR)/executions.db ".mode column" ".headers on" \
		"SELECT id, fase, variant, status, created_at FROM executions ORDER BY created_at DESC;"

# ── Lint & Format ─────────────────────────────────────────────────────────────

.PHONY: lint lint-backend lint-frontend fmt fmt-backend fmt-frontend
lint: lint-backend lint-frontend ## Lint de backend + frontend

lint-backend: ## Lint Python con ruff (pip install ruff si no está)
	cd $(BACKEND_DIR) && $(RUFF_CMD) check app/

lint-frontend: ## Lint JS con eslint
	cd $(FRONTEND_DIR) && npm run lint --if-present

fmt: fmt-backend fmt-frontend ## Formatea backend + frontend

fmt-backend: ## Formatea Python con ruff format
	cd $(BACKEND_DIR) && $(RUFF_CMD) format app/

fmt-frontend: ## Formatea JS/JSX con prettier
	cd $(FRONTEND_DIR) && npx prettier --write "src/**/*.{js,jsx}"

# ── Build ─────────────────────────────────────────────────────────────────────

.PHONY: build build-frontend
build: build-frontend ## Build de producción

build-frontend: ## Build Vite para producción (dist/)
	cd $(FRONTEND_DIR) && npm run build

# ── Open ──────────────────────────────────────────────────────────────────────

.PHONY: open open-api open-gh
open: ## Abre el frontend en el navegador
	@xdg-open http://localhost:5173 2>/dev/null || open http://localhost:5173 2>/dev/null || true

open-api: ## Abre la documentación OpenAPI
	@xdg-open http://localhost:8000/docs 2>/dev/null || open http://localhost:8000/docs 2>/dev/null || true

open-gh: ## Abre la organización de repositorios GitHub
	@xdg-open https://github.com/TeheORG 2>/dev/null \
		|| open https://github.com/TeheORG 2>/dev/null || true

# ── Clean ─────────────────────────────────────────────────────────────────────

.PHONY: clean clean-pids clean-frontend
clean: stop clean-pids clean-frontend ## Para servicios y limpia artefactos generados

clean-pids: ## Elimina PIDs y logs de procesos locales
	@rm -rf $(PID_DIR) && echo "PIDs y logs eliminados"

clean-frontend: ## Elimina node_modules y dist del frontend
	@rm -rf $(FRONTEND_DIR)/node_modules $(FRONTEND_DIR)/dist \
		&& echo "node_modules y dist eliminados"
