# Vista Consulta — Mejoras

Mejoras a implementar sobre Vista 2 para mejorar la experiencia al lanzar ejecuciones y revisar su estado.

---

## Multi executions

**Contexto:** Actualmente `PhaseCard` lanza una sola ejecución por submit. En flujos de MLOps es habitual ejecutar un conjunto de variantes a la vez para una misma fase.

**Cambio:** Añadir un modo "multi" en `PhaseCard` que acepte una lista de variantes (una por línea) y haga `createExecution` en paralelo para cada una con los mismos parámetros y runner.

**UI:** Toggle entre modo single (comportamiento actual) y modo multi. En modo multi el input de variant se expande a un `<textarea>`.

**Comportamiento:**
- Se valida que cada variante sea non-empty antes de disparar.
- Si alguna falla, las demás no se bloquean — se reportan los errores por variante al lado del nombre.
- El botón de submit muestra el conteo: `Ejecutar (3)`.

---

## Variant picker en PhaseCard

**Contexto:** El input de variant actualmente solo tiene `latestEx.variant` como placeholder. El usuario tiene que recordar o copiar el nombre exacto.

**Cambio:** Reemplazar el `<input>` de variant por un `<Combobox>` que cargue las variantes disponibles del servicio de variantes (`getRows({ phase: phase.id })`). El usuario puede escribir para filtrar o elegir de la lista.

**Detalles:**
- La query de variantes se lanza con `staleTime: 60_000` para no saturar.
- Si la fase no tiene variantes registradas (fase nueva), el combobox actúa como input libre.
- El valor libre sigue siendo válido — el picker es una ayuda, no una restricción.
- Mismo combobox para el campo `parent` cuando `phase.parentRequired` es true.

---

## Inline error feedback en PhaseCard

**Contexto:** Los errores de `createExecution` actualmente se muestran con `alert()`.

**Cambio:** Mostrar el mensaje de error como texto inline debajo del botón "Ejecutar", con un botón ✕ para cerrar. Usar el `error_code` del backend cuando esté disponible para dar mensajes descriptivos (ver tabla de errores en `10_Servicio_VistaConslta.md`).

---

## Cancelar ejecuciones en estado queued

**Contexto:** En `PipelinePanel` el botón "Cancelar" tiene la condición `ex.status !== 'queued'`, por lo que las ejecuciones encoladas no se pueden cancelar desde la UI.

**Cambio:** Mostrar el botón "Cancelar" también para `queued`. El endpoint `POST /api/executions/{id}/cancel` ya soporta ese estado.

---

## Re-run desde HistoryPanel

**Contexto:** `HistoryPanel` muestra el botón "Reintentar" solo para `failed` y `canceled`. Las ejecuciones `success` no tienen ninguna acción.

**Cambio:** Añadir un botón "Re-run" para `success` que cree una nueva ejecución con los mismos `fase`, `variant`, `parent` y `params`. Es distinto de "Reintentar" (que reutiliza el id) — aquí se crea una entrada nueva.

---

## Pre-rellenar PhaseCard desde el histórico

**Contexto:** Cuando el usuario quiere repetir o ajustar una ejecución pasada, tiene que copiar variant y params manualmente.

**Cambio:** Al seleccionar una ejecución en `HistoryPanel`, añadir un botón "Cargar en tarjeta" que lleve sus `variant`, `parent` y `params` al estado de la `PhaseCard` correspondiente.

**Mecanismo:** Emitir un evento (context o ref hacia arriba en `Vista2.jsx`) que la fase target escuche para actualizar su estado local.

---

## Panel de detalle de ejecución

**Contexto:** Al seleccionar una ejecución en Pipeline o Histórico solo aparecen los botones de acción. No hay forma de ver los params completos, el timing ni el link a GitHub Actions.

**Cambio:** Expandir el bloque seleccionado (o añadir un drawer lateral) con:
- Params completos formateados como JSON o chips.
- `created_at` → `updated_at` con duración calculada.
- `gh_run_id` como link a la run de GitHub Actions (si está configurado).
- `error_code` con descripción humana mapeada desde la tabla de errores conocidos.
- Botón "Ver logs" que navega a Vista LogsRunners filtrado por `gh_run_id`.

---

## Link a logs desde ejecuciones activas

**Contexto:** No hay forma de ir directamente a los logs de una ejecución en curso.

**Cambio:** En `PipelinePanel`, cuando una ejecución tiene `gh_run_id` y `status === 'running'`, mostrar un icono/link "Logs →" que navegue a Vista LogsRunners prefiltrando por ese run.

---

## Sincronización de filtros entre paneles

**Contexto:** Los filtros de Pipeline e Histórico son independientes. Si el usuario quiere ver todo lo de una variante, tiene que escribirlo dos veces.

**Cambio:** Añadir un checkbox "Sincronizar filtros" en la barra superior. Cuando está activo, el filtro de variante de Pipeline y el de Histórico se mueven juntos.
