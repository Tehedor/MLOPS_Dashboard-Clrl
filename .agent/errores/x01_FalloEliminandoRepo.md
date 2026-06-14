# Fallo de contorl de linaje con repos vacíos

Cuando elimino repos de external, linejae me sigue creando el control de lineaje (lineage_registry.json) por lo que luego si intento rearracnar una pipeline no me deja al tener contenido ya este directorio



## Observaciones
Los cambios que hagas y el como funcione añademlo debajo de este file para poder auditarlo.

---

## Implementación — 2026-06-09

**Causa raíz:** `lineage_registry_service.sync()` llegaba hasta `_save_registry()` aunque la pipeline hubiese sido eliminada de `external/`. `_save_registry` hace `path.parent.mkdir(parents=True, exist_ok=True)`, lo que recreaba el árbol de directorios (`external/<repo>/executions/`) con solo `lineage_registry.json` dentro. Al intentar re-clonar con `git clone`, el proceso fallaba porque el directorio destino ya existía con contenido.

**Fix aplicado (`backend/app/services/lineage_registry_service.py`, función `sync`):**
```python
if not executions_root.is_dir():
    log.warning("lineage_registry: executions dir missing for '%s', skipping sync", pipeline_id)
    return {"added": 0, "removed": 0, "updated": 0, "total": 0, "synced_at": None}
```
Se añadió esta guarda justo antes de `_load_registry`. Si el directorio de executions no existe (repo eliminado), la función retorna sin escribir nada en disco.

**Comportamiento tras el fix:** Al eliminar un repo de `external/` y ejecutar de nuevo el setup, `git clone` ya no encuentra el directorio porque el registry no lo habrá recreado.