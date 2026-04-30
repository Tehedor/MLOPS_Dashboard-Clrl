# Service Viewer

Estado: Diseñado - Pendiente implementar

## Objetivo

Vista nueva en `/services` que muestra los servicios Docker de visualización definidos en `config/services_external_ctrl.yaml`. Permite seleccionar una variante, comprobar/descargar sus artefactos DVC y arrancar/parar el servicio. Cuando está levantado, aparece un botón para abrirlo en ventana nueva.

---

## Decisiones cerradas

| Decisión | Valor |
|---|---|
| ¿Nueva vista o integrada? | Vista nueva — `/services`, label "Servicios" en nav |
| ¿Cómo se abre la app? | `window.open('http://localhost:<port>', '_blank')` — ventana nueva |
| ¿DVC es bloqueante? | Sí. Si la variante no está local, descarga DVC primero, luego arranca |
| ¿Qué variantes muestra cada servicio? | Las variantes de las fases listadas en `fases:` del YAML, via `/api/variants/rows?phase=<fase>` |
| ¿Solo temporal_app funciona? | Sí, `windows-app` se muestra pero puede deshabilitarse con flag en el YAML |

---

## Fuente de configuración

`config/services_external_ctrl.yaml` — leído en runtime por el backend, no hardcodeado.

Estructura actual:
```yaml
Services:
  mds-dashboard:
    url_repo: ...
    branch: main
    path: services/temporal_app          # relativo a PROJECT_ROOT
    port: 8050
    fases:
      - f03_windows
    commands:
      - name: "Run"
        command: "run_temporal_app"
        params:
          - name: "Dataset Variant"
            env_var: VARIANT
            type: string
          - name: "Epoch Mode"
            env_var: EPOCH_MODE
            type: select
            options: ["true", "false"]
      - name: "Stop"
        command: "stop_temporal_app"
```

El Makefile de arranque está en `services/Makefile`.

---

## Backend — qué implementar

Nuevo router en `backend/app/api/routers/services.py` y servicio en `backend/app/services/services_service.py`.

### API endpoints

```
GET  /api/services                        → lista servicios del YAML con metadata
POST /api/services/{service_id}/run       → ejecuta `make <command>` en services/ con env vars
POST /api/services/{service_id}/stop      → ejecuta `make stop_<command>` en services/
GET  /api/services/{service_id}/status    → true/false si el puerto está respondiendo (httpx GET localhost:<port>)
```

**POST /api/services/{service_id}/run** body:
```json
{
  "command": "run_temporal_app",
  "env": { "VARIANT": "v1_0021", "EPOCH_MODE": "false" }
}
```

### Status check

El backend hace `httpx.get(f"http://localhost:{port}", timeout=2)` — si responde → up.
Alternativa: `docker ps --filter name=<container>` si el puerto no es fiable.
Usar httpx como primera opción; fallback docker si falla 3 veces seguidas.

### DVC — integración

Reutilizar la infraestructura ya existente en `variants_service.py`:
- `GET /api/variants/rows?phase=<fase>` → para saber el `local_status` de la variante seleccionada
- `POST /api/variants/local/pull` → para descargar si no está local

El frontend orquesta: primero comprueba, si `not_local` o `partial` lanza pull y espera al job, luego arranca el servicio.

### Permisos

El backend necesita poder ejecutar `make` en `services/`. Asumir que corre en la misma máquina que los contenedores Docker.

---

## Frontend — qué implementar

### Ruta

`/services` — nueva página `fronted/src/pages/Services.jsx`
Añadir a `Shell.jsx` y `App.jsx`.

### Feature

`fronted/src/features/services/` con:
- `ServiceCard.jsx` — tarjeta por servicio
- `VariantSelector.jsx` — dropdown de variantes con estado DVC
- (API) `fronted/src/api/services.js`

---

## Diseño de interfaz

```
┌──────────────────────────────────────────────────────────────────────┐
│ MLOps | Dashboard | Ejecuciones | GH Actions | Runners | Servicios… │
├──────────────────────────────────────────────────────────────────────┤
│  Services │ faseX disponible        │   fasseY disponible....
│           │ 
│  Service1 │ v1_XXXX    Run enacle x
│           │ v1_XXXX    Stop
│  Service2 │  ....
│           │ 
│           │  
│           │ 
│ 
│  
│  
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Estados de la tarjeta

| Estado visible | Descripción |
|---|---|
| `○ Parado` | Servicio no responde en el puerto |
| `⟳ Descargando DVC…` | Esperando `dvc pull` del job |
| `⟳ Arrancando…` | `make run_X` lanzado, aún no responde |
| `● Running` | Puerto responde — aparece botón "Abrir →" |
| `✗ Error` | Fallo en DVC pull o en arranque — mostrar mensaje |

### Flujo al pulsar "Arrancar"

```
Usuario pulsa [Arrancar]
  │
  ├─ GET /api/variants/rows?phase=<fase>&q=<variant>
  │    local_status == "local"? ──── sí ──→ saltar a arrancar
  │                              └── no ──→ mostrar "Descargando DVC..."
  │                                          POST /api/variants/local/pull
  │                                          poll GET /api/variants/jobs/:job_id
  │                                          job done? ──── error → mostrar error
  │                                                    └── ok → continuar
  │
  ├─ mostrar "Arrancando..."
  ├─ POST /api/services/{id}/run  {command, env:{VARIANT, ...}}
  └─ poll GET /api/services/{id}/status cada 2s
       up? ──── sí → estado "● Running"
            └── no → seguir polling (máx 60s, luego "Timeout")
```

### Selector de variantes

- Dropdown con todas las variantes de las fases del servicio
- Cada opción muestra: nombre + icono de estado DVC (✓ local, ✗ no local, ~ parcial)
- Si el servicio tiene varias fases, agrupar por fase en el dropdown

### Params extra (EPOCH_MODE, etc.)

- Renderizado dinámico desde el YAML: `type: select` → `<select>`, `type: string` → `<input>`
- Solo aparecen los params del comando `run_*` (no del `stop_*`)

---

## Columnas dinámicas

Las tarjetas se generan iterando `Services` del YAML — no hay límite hardcodeado.
Si un servicio tiene `enabled: false` en el YAML se omite (campo opcional, default true).

---

## Archivos a crear/modificar

### Backend
- `backend/app/api/routers/services.py` (nuevo)
- `backend/app/services/services_service.py` (nuevo)
- `backend/app/main.py` → añadir router

### Frontend
- `fronted/src/pages/Services.jsx` (nuevo)
- `fronted/src/features/services/ServiceCard.jsx` (nuevo)
- `fronted/src/features/services/VariantSelector.jsx` (nuevo)
- `fronted/src/api/services.js` (nuevo)
- `fronted/src/App.jsx` → añadir ruta `/services`
- `fronted/src/components/layout/Shell.jsx` → añadir nav item

---

## Notas de implementación

- Solo `mds-dashboard` (temporal_app) funciona hoy. El servicio `windows-app` se puede mostrar deshabilitado.
- El backend asume que corre en la misma máquina que Docker.
- El Makefile de servicios está en `services/Makefile`, el CWD del subprocess debe ser `PROJECT_ROOT/services/`.
- No usar el mismo worker DVC de variants_service para el arranque del servicio — son operaciones independientes.
- El poll de status en frontend: cada 2s, máximo 60s, luego mostrar "Timeout — comprueba Docker".
