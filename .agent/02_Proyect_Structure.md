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

---

## Fixes aplicados

### x01 — lineage_registry_service bloquea re-setup al eliminar repos

**Problema:** `lineage_registry_service.sync()` llamaba a `_save_registry()` que hace `mkdir(parents=True)` sobre el directorio de executions. Si el repo ya había sido eliminado de `external/`, se recreaba el directorio vacío con `lineage_registry.json` dentro. Al intentar re-setup, `git clone` fallaba porque el directorio destino ya existía con contenido.

**Fix (`backend/app/services/lineage_registry_service.py`):**
- Se añadió guarda al inicio de `sync()`: si `executions_root.is_dir()` es `False`, se retorna inmediatamente sin escribir nada.
- `_save_registry()` no se toca — el `mkdir` solo se ejecuta cuando el directorio ya existe previamente (ya que `sync` salta si no existe).
