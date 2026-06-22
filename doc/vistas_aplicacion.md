# Vistas y funcionamiento de la aplicación

La aplicación es una SPA (Single Page Application) con 7 vistas accesibles desde la barra de navegación superior. Todas las vistas comparten un **Shell** común que incluye:

- Barra de navegación con las 7 vistas
- Enlaces externos a DagsHub, MLflow y GitHub Actions (dropdowns por pipeline)
- Toggle de tema claro/oscuro
- Selector de pipeline-project cuando hay múltiples pipelines configurados

---

## Vista 1 — Dashboard (`/vista1`)

Vista principal de resumen general. Actualmente pendiente de implementación (placeholder).

**Ruta:** `/vista1` (ruta por defecto al abrir la aplicación)

---

## Vista 2 — Ejecuciones (`/vista2`)

Vista principal de operación. Permite lanzar ejecuciones de fases del pipeline, monitorizar su estado en tiempo real y consultar el histórico.

**Layout de 3 paneles redimensionables:**

```
┌─────────────────────┬──────────────────┬──────────────────┐
│   Panel izquierdo   │  Panel central   │  Panel derecho   │
│                     │    "Pipeline"     │   "Histórico"    │
│  ┌───────────────┐  │                  │                  │
│  │ Pipeline tabs │  │  Lista de eje-   │  Histórico com-  │
│  │ (por proyecto)│  │  cuciones acti-  │  pleto de todas  │
│  ├───────────────┤  │  vas filtradas   │  las ejecuciones │
│  │ Setup estado  │  │  por variante,   │  con filtros     │
│  │ de la rama    │  │  fase, pipeline  │  sincronizables  │
│  ├───────────────┤  │  y runner        │  con el panel    │
│  │ Por fase |    │  │                  │  central         │
│  │       Batch   │  │                  │                  │
│  ├───────────────┤  │                  │                  │
│  │ PhaseCards    │  │                  │                  │
│  │ (formularios  │  │                  │                  │
│  │  por fase)    │  │                  │                  │
│  └───────────────┘  │                  │                  │
└─────────────────────┴──────────────────┴──────────────────┘
```

**Funcionalidad:**

- **Panel izquierdo — Lanzamiento:** Tabs por pipeline-project. Dos modos:
  - *Por fase:* Tarjetas individuales por cada fase del pipeline con formulario de parámetros (según `traceability_schema.yaml`) y botón de dispatch a GitHub Actions.
  - *Batch:* Carga de fichero de lotes para lanzar múltiples variantes de forma secuencial.
- **Panel central — Pipeline activo:** Lista de ejecuciones en curso/recientes. Filtros por variante, fase, pipeline y runner. Muestra estado en tiempo real vía SSE.
- **Panel derecho — Histórico:** Histórico completo con los mismos filtros. Opción "Sync" para sincronizar filtros con el panel central. Permite cargar parámetros de una ejecución pasada en el formulario de la fase correspondiente.
- Los paneles central y derecho son colapsables mediante muescas laterales rotuladas.
- Los anchos de panel se persisten en `localStorage`.

**Datos en tiempo real:** Las ejecuciones se actualizan vía Server-Sent Events (SSE) desde `/api/executions/stream`. Adicionalmente, se fusionan datos de Supabase Realtime (ejecuciones de GitHub Actions) con las ejecuciones locales.

---

## Vista 3 — GH Actions (`/vista3`)

Visor de logs de ejecuciones de GitHub Actions y ejecuciones locales.

```
┌──────────────────────────────────────────────────────────────┐
│  Barra de filtros: búsqueda, pipeline, fase, estado          │
├────────────────┬─────────────────────────────────────────────┤
│  Lista de runs │  Visor de logs                              │
│  (izquierda,   │  (derecha, ocupa el resto)                  │
│   ancho fijo)  │                                             │
│                │  - Logs GH Actions (descargados bajo        │
│  Cada run      │    demanda vía API)                         │
│  muestra:      │  - Logs locales (streaming SSE)             │
│  - workflow    │  - Códigos ANSI renderizados como HTML      │
│  - estado      │    con colores                              │
│  - fecha       │                                             │
│  - pipeline    │                                             │
└────────────────┴─────────────────────────────────────────────┘
```

**Funcionalidad:**

- **Fuente dual de datos:** Fusiona runs de Supabase (GitHub Actions webhook) con ejecuciones locales del backend. Supabase tiene prioridad cuando hay duplicados por `gh_run_id`.
- **Filtros:** Por estado (Esperando, Ejecutando, Terminado, Fallado), por pipeline-project, por fase, y búsqueda libre por workflow, rama, fase o variante.
- **Logs de GH Actions:** Se descargan bajo demanda al seleccionar un run. Se cachean a nivel de módulo para sobrevivir a cambios de página.
- **Logs locales:** Streaming en tiempo real mediante SSE con renderizado de códigos ANSI a HTML coloreado.

---

## Vista 4 — Runners (`/vista4`)

Terminal remota a los runners ESP32 físicos y virtuales vía WebSocket + Xterm.js.

```
┌──────────┬───────────────────────────────────────────────────┐
│ Sidebar  │  ┌─ Columna 1 ─────────┬─ Columna 2 ─────────┐  │
│ runners  │  │ [tab1] [tab2] [+]   │ [tab1] [+]           │  │
│          │  │                      │                      │  │
│ ● runner1│  │  Terminal Xterm.js   │  Terminal Xterm.js   │  │
│ ○ runner2│  │  (sesión activa)     │  (sesión activa)     │  │
│ ○ runner3│  │                      │                      │  │
│ ● runner4│  │──────────────────────│──────────────────────│  │
│          │  │ [tab3]               │                      │  │
│          │  │  Terminal (split)    │                      │  │
│          │  └──────────────────────┴──────────────────────┘  │
└──────────┴───────────────────────────────────────────────────┘
```

**Funcionalidad:**

- **Sidebar:** Lista de runners disponibles (configurados en `config.yaml`), con indicador de sesiones activas. Click para abrir nueva sesión en la celda activa.
- **Grid de terminales:** Hasta 3 columnas, cada una divisible en 2 filas. Totalmente flexible: agregar/quitar columnas, split vertical por columna.
- **Tabs por celda:** Múltiples sesiones en una misma celda con navegación por pestañas. Drag & drop para mover sesiones entre celdas.
- **Persistencia:** Las sesiones de terminal se mantienen montadas aunque se navegue a otra vista (el componente Vista4 permanece montado con `display:none`), preservando la conexión WebSocket.
- **Xterm.js:** Terminal completa con soporte de redimensionado automático (`@xterm/addon-fit`) y conexión WebSocket al backend, que hace proxy a los runners físicos vía ttyd.

---

## Vista 5 — Linaje (`/linaje`)

Visualización del grafo de linaje de variantes a lo largo de las fases del pipeline mediante React Flow.

```
┌──────────────────────────────────────────────────────────────┐
│  Pipeline Lineage  [selector]  42 variantes  [fecha] [buscar]│
│                                          [vista] [Sync]      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│    ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐         │
│    │F01   │────→│F02   │────→│F03   │────→│F04   │         │
│    │v1_001│     │v2_001│     │v3_001│     │v4_001│         │
│    │v1_002│     │v2_002│     │v3_002│     │      │         │
│    └──────┘     └──────┘     └──────┘     └──────┘         │
│         └──────────────→│F05   │────→│F06   │               │
│                         │v5_001│     │v6_001│               │
│                         └──────┘     └──────┘               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Funcionalidad:**

- **3 modos de visualización** (ciclables con un botón):
  - *Compacto:* Nodos pequeños agrupados por fase, conexiones minimizadas.
  - *Clásico:* Columnas por fase con nodos de variante dentro.
  - *Detalle:* Lista expandida con toda la información por variante.
- **Filtrado:** Por texto libre (nombre de variante) y por rango de fechas de creación.
- **Interacción:** Click en un nodo de variante abre un panel de detalle con:
  - Metadatos de la variante (parámetros, outputs).
  - Enlace directo al run de GitHub Actions correspondiente (si existe `gh_run_id`).
- **Sincronización:** Botón Sync para forzar re-escaneo del registro de linaje. Auto-refresh periódico basado en el intervalo de sync del backend. Se invalida automáticamente al completar ejecuciones vía SSE.

---

## Vista 6 — Variantes (`/variants`)

Tabla interactiva de exploración de variantes por fase con gestión de artefactos locales y remotos.

```
┌──────────────────────────────────────────────────────────────┐
│  [Pipeline ▾]  [F01] [F02] [F03] [F04] [F05] [F06]         │
├──────────────────────────────────────────────────────────────┤
│  Buscar variante…                    42 variantes  ↻Sync    │
│                                              [Columnas ▾]   │
├────┬──────────┬──────────┬──────────┬──────────┬────────────┤
│    │ Variante │ param_A  │ param_B  │ metric_X │   Local    │
│    │ sort/flt │ sort/flt │ sort/flt │ sort/flt │            │
├────┼──────────┼──────────┼──────────┼──────────┼────────────┤
│ x  │ v1_0001  │  0.5     │  128     │  0.92    │ Local (2MB)│
│ x  │ v1_0002  │  0.3     │  256     │  0.87    │ No local   │
│ x  │ v1_0003  │  0.7     │   64     │          │ Parcial    │
├────┴──────────┴──────────┴──────────┴──────────┴────────────┤
│                              << <  Pag 1 / 3  > >>          │
└──────────────────────────────────────────────────────────────┘
```

**Funcionalidad:**

- **Selector de pipeline** y **tabs por fase:** Cada fase tiene su propia tabla con columnas configuradas en `table_config.yaml`.
- **Columnas dinámicas:** Las columnas se generan a partir de la configuración YAML. Columnas base (variante, estado) + columnas de fuentes de datos (parámetros, métricas). Visibilidad configurable con el menú "Columnas".
- **Filtrado y ordenación:** Búsqueda global por variante. Filtro por columna (popup con input). Ordenación ascendente/descendente por click en cabecera. Columnas redimensionables por arrastre.
- **Estado de ejecución:** Indicador por variante: completada (check verde), fallida (cruz roja), en ejecución (spinner), pendiente (punto gris).
- **Gestión de artefactos locales (columna Local):**
  - Descarga individual o en bulk (DVC pull desde remote).
  - Eliminación de artefactos locales (individual o bulk).
  - Estado: Local (con tamaño), Parcial (ficheros presentes/esperados), No local.
  - Reportes HTML generados enlazados directamente.
- **Eliminación de variantes del repositorio:** Modo selección activable desde el icono de papelera en la cabecera. Permite seleccionar múltiples variantes y eliminarlas del repositorio remoto vía PR automática. Confirmación obligatoria.
- **Operaciones bulk:** Selección por checkbox (individual o página completa), con barra de acciones para descarga/eliminación masiva y progreso visual.
- **Paginación:** 100 variantes por página con navegación primera/anterior/siguiente/última.

---

## Vista 7 — Servicios (`/services`)

Gestión de servicios Docker externos asociados al pipeline (MLflow, DagsHub, analizers, etc.).

```
┌──────────────────────────────────────────────────────────────┐
│  [Pipeline ▾]                                                │
├──────────────┬───────────────────────────────────────────────┤
│  Sidebar     │  Panel de servicio                            │
│              │                                               │
│  * MLflow    │  Nombre: MLflow Tracking Server               │
│  o Analyzer  │  Estado: * Running                            │
│  o Dashboard │  Imagen: ghcr.io/...                          │
│              │  Puerto: 5000                                  │
│              │  Memoria: 4g                                   │
│              │                                               │
│              │  [Start] [Stop] [Restart] [Logs]              │
└──────────────┴───────────────────────────────────────────────┘
```

**Funcionalidad:**

- **Sidebar:** Lista de servicios definidos en `services_external_ctrl.yaml` para el pipeline activo, con indicador de estado (running/stopped). Polling cada 3 segundos.
- **Panel de servicio:** Detalle del servicio seleccionado con controles de ciclo de vida (start/stop/restart) y acceso a logs.
- **Límite de memoria** configurable por servicio (default desde `config.yaml`).
- Auto-selección del primer servicio en ejecución al cargar la vista.

---

## Flujo de datos general

```
                    ┌─────────────────┐
                    │  GitHub Actions  │
                    │  (workflows)     │
                    └────────┬────────┘
                             │ webhook
                    ┌────────▼────────┐
                    │    Supabase     │
                    │  (Edge Function │
                    │   + Realtime)   │
                    └────────┬────────┘
                             │ WebSocket
┌──────────┐     ┌───────────▼──────────┐     ┌──────────────┐
│ Frontend │<--->│   Backend FastAPI    │<--->│  Repos Git   │
│ React    │ API │                      │ git │  (external/) │
│ + Vite   │ SSE │  - Execution queue   │     └──────────────┘
│          │ WS  │  - GH API dispatch   │
└──────────┘     │  - Repo sync polling │     ┌──────────────┐
                 │  - Lineage registry  │<--->│   SQLite     │
                 │  - Variants (DVC)    │     │ executions.db│
                 │  - Terminal proxy    │     └──────────────┘
                 └──────────┬───────────┘
                            │ WebSocket
                   ┌────────▼────────┐
                   │  Runners ESP32  │
                   │  (ttyd/serial)  │
                   └─────────────────┘
```

**Ciclo de una ejecución:**

1. El usuario configura parámetros en Vista 2 (o carga un batch) y pulsa "Ejecutar".
2. El backend encola la ejecución en SQLite y realiza `dispatch` a la GitHub API.
3. GitHub Actions ejecuta el workflow correspondiente en el runner asignado.
4. Supabase Edge Function recibe el webhook de completion y lo escribe en la tabla `workflow_runs`.
5. El frontend recibe la actualización por Supabase Realtime y/o SSE del backend.
6. El backend hace `git pull` periódico del repositorio clonado para refrescar resultados, linaje y variantes.
7. Los resultados aparecen en las vistas de Linaje, Variantes y GH Actions.

---

## Mapa de componentes por vista

| Vista | Página | Componentes principales | Datos |
|---|---|---|---|
| Dashboard | `Vista1.jsx` | (placeholder) | — |
| Ejecuciones | `Vista2.jsx` | `PhaseCard`, `BatchPanel`, `PipelinePanel`, `HistoryPanel`, `PipelineProjectSetup`, `ResizeHandle`, `PipelineSelect` | SSE + Supabase Realtime + REST |
| GH Actions | `LogsRunners.jsx` | `RunList`, `LogViewer`, `PipelineSelect` | Supabase + REST + GH Logs API |
| Runners | `Vista4.jsx` | `RunnerSidebar`, `TerminalTabs`, `TerminalPane` | WebSocket (Xterm.js) |
| Linaje | `Linaje.jsx` | `LineageGraph`, `PipelineSelect` | REST + SSE (invalidación) |
| Variantes | `Variants.jsx` | `PhaseTable`, `ColVisibilityMenu`, `BulkActionBar`, `RepoDeleteBar`, `LocalCell`, `DeleteVariantBtn`, `PipelineSelect` | REST (polling) |
| Servicios | `Services.jsx` | `ServiceSidebar`, `ServicePanel`, `PipelineSelect` | REST (polling 3s) |

## Mapa de rutas

| Ruta | Componente | Label en nav |
|---|---|---|
| `/` | Redirect → `/vista1` | — |
| `/vista1` | `Vista1` | Dashboard |
| `/vista2` | `Vista2` | Ejecuciones |
| `/vista3` | `LogsRunners` | GH Actions |
| `/vista4` | `Vista4` | Runners |
| `/linaje` | `Linaje` | Linaje |
| `/variants` | `Variants` | Variantes |
| `/services` | `Services` | Servicios |
