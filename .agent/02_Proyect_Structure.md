# 02 Proyect Structure

Estructura lógica mínima.

## Backend
- `backend/app/main.py`
- `backend/app/api/routers/`
- `backend/app/core/`
- `backend/app/schemas/`
- `backend/app/services/`

## Frontend
- `fronted/src/api/`
- `fronted/src/components/ui/`
- `fronted/src/components/layout/`
- `fronted/src/features/`
- `fronted/src/pages/`
- `fronted/src/utils/`
- `fronted/src/App.jsx`
- `fronted/src/main.jsx`

## Raíz
- `traceability_schema.yaml`
- `fases_execution_runners.yaml`
- `60_deploy-api.http`
- `config.yaml`
- `.env.example`

## Reglas
- La lógica de negocio vive en `features/`.
- La UI compartida vive en `components/ui` y `components/layout`.
- Los contratos de fase viven en YAML, no en el código duplicado.
