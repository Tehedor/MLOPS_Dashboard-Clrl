# Commands

Referencia de todos los comandos de gestión del proyecto.

```bash
make help   # lista completa con descripciones
```

---

## Setup

| Comando          | Acción                                   |
|------------------|------------------------------------------|
| `make install`   | Instala dependencias Python + Node       |
| `make install-backend` | `pip install -r requirements.txt`  |
| `make install-frontend` | `npm install`                     |
| `make env`       | Crea `backend/.env` desde `.env.example` |

---

## Dev local (procesos background)

Logs en `.pids/backend.log` y `.pids/frontend.log`.

| Comando                                         | Acción                          |
|-------------------------------------------------|---------------------------------|
| `make dev`                                      | Arranca backend + frontend      |
| `make dev-backend` / `make dev-frontend`        | Arranca servicio individual     |
| `make stop`                                     | Para backend + frontend         |
| `make stop-backend` / `make stop-frontend`      | Para servicio individual        |
| `make restart`                                  | Para + arranca ambos            |
| `make restart-backend` / `make restart-frontend`| Reinicia servicio individual    |
| `make status`                                   | Estado (RUNNING/STOPPED + PID)  |
| `make logs`                                     | `tail -f` de ambos servicios    |
| `make logs-backend` / `make logs-frontend`      | Logs de servicio individual     |

---

## Docker

| Comando                    | Acción                              |
|----------------------------|-------------------------------------|
| `make docker-up`           | `compose up -d`                     |
| `make docker-up-build`     | Rebuild de imágenes + up            |
| `make docker-down`         | Para y elimina contenedores         |
| `make docker-restart`      | down + up                           |
| `make docker-build`        | Construye imágenes sin levantar     |
| `make docker-logs`         | `compose logs -f`                   |
| `make docker-ps`           | Estado de los contenedores          |
| `make docker-shell-backend`| Shell interactivo en el backend     |

---

## Base de datos

| Comando        | Acción                                  |
|----------------|-----------------------------------------|
| `make db-reset`| Elimina `executions.db`                 |
| `make db-shell`| SQLite interactivo                      |
| `make db-dump` | Vuelca tabla `executions` a stdout      |

---

## Lint & Format

| Comando              | Acción                              |
|----------------------|-------------------------------------|
| `make lint`          | `ruff check` + `eslint`             |
| `make lint-backend`  | `ruff check app/`                   |
| `make lint-frontend` | `npm run lint`                      |
| `make fmt`           | `ruff format` + `prettier`          |
| `make fmt-backend`   | `ruff format app/`                  |
| `make fmt-frontend`  | `prettier --write "src/**/*.{js,jsx}"` |

---

## Build

| Comando               | Acción                        |
|-----------------------|-------------------------------|
| `make build`          | Build completo de producción  |
| `make build-frontend` | `npm run build` → `dist/`     |

---

## Utilidades

| Comando        | Acción                                       |
|----------------|----------------------------------------------|
| `make open`    | Abre `http://localhost:5173` en el navegador |
| `make open-api`| Abre `http://localhost:8000/docs`            |
| `make open-gh` | Abre el repo de GitHub Actions               |
| `make clean`   | Para servicios + elimina PIDs/logs/node_modules |
| `make clean-pids` | Elimina solo `.pids/`                     |
| `make clean-frontend` | Elimina `node_modules` y `dist/`       |
