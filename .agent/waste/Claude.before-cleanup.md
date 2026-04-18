# Claude.md

Este archivo es la memoria corta del proyecto. Úsalo para evitar releer toda la carpeta `.agent` en cada tarea.

## Fuente de verdad

Orden de prioridad para entender o cambiar la aplicación:
1. `.agent/01_Stack.md`
2. `.agent/02_Proyect_Structure.md`
3. `.agent/10.5_Servicio_VistaConslta.md`
4. `.agent/03_Interfaz_General.md`
5. Los archivos de configuración reales: `traceability_schema.yaml`, `fases_execution_runners.yaml`, `60_deploy-api.http`, `confg.yaml`, `.env.example`

`00_App.md` existe, pero mezcla una propuesta antigua con otras decisiones ya más concretas. Si hay conflicto, manda la documentación más específica y reciente.

## Decisiones actuales del proyecto

- Backend: FastAPI en Python.
- Frontend: React con Vite.
- Infraestructura: Docker y Docker Compose.
- Persistencia ligera: SQLite.
- UI: Tailwind CSS + Shadcn UI.
- Datos reactivos: TanStack Query.
- Grafo de linaje: React Flow.
- Logs en tiempo real: SSE + renderizado ANSI.
- Terminal remota: Xterm.js + WebSockets.
- Cliente GitHub: `httpx`.

## Mapa funcional

- Vista 1: dashboard y grafo de linaje.
- Vista 2: consulta, ejecución de fases y buffer/cola.
- Vista 3: logs de jobs con estilo GitHub Actions.
- Vista 4: control de runners y terminales embebidas.

## Datos y reglas clave

- `traceability_schema.yaml` define los parámetros dinámicos, tipos, validaciones y defaults por fase.
- `fases_execution_runners.yaml` define qué fase corre en qué runner y con qué `max-parallel`.
- `60_deploy-api.http` contiene ejemplos reales de payloads para dispatch a GitHub.
- `confg.yaml` apunta al repositorio de GitHub Actions.
- `.env.example` marca las variables de entorno esperadas.

## Convenciones de trabajo

- Antes de implementar algo nuevo, revisar primero la documentación de `.agent` y luego los YAML de configuración.
- Mantener los cambios pequeños y alineados con el stack decidido.
- No asumir persistencia extra ni servicios adicionales si no están en la documentación.
- Si un archivo con contenido real va a ser modificado, guardar antes una copia del original en `.agent/waste/`.
- Si el archivo original estaba vacío, no hace falta copiarlo a `waste`.

## Estado de los módulos en `.agent`

- `01_Stack.md`: stack general y prioridades.
- `02_Proyect_Structure.md`: estructura recomendada de frontend y backend.
- `03_Interfaz_General.md`: layout general de navegación.
- `10.5_Servicio_VistaConslta.md`: especificación más completa de la vista de consulta.
- `20_Servicio2_JerarquiaVariante-fase.md`: vacío.
- `30_Servicio3_logsRunners.md`: vacío.
- `40_Servicio4_ctrl_endebidos.md`: vacío.
- `.agent/waste/`: espacio para backups u originales previos cuando haga falta.

## Regla práctica para agentes

Si una tarea toca formularios, estados, colas, dependencias o dispatch a GitHub, la referencia principal es `10.5_Servicio_VistaConslta.md`. Si toca estructura general, usar `01_Stack.md` y `02_Proyect_Structure.md`.