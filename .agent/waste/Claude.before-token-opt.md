# Claude.md

Memoria corta del proyecto. Sirve para no releer toda `.agent` en cada tarea.

## Fuente de verdad
1. [01_Stack.md](.agent/01_Stack.md)
2. [02_Proyect_Structure.md](.agent/02_Proyect_Structure.md)
3. [10.5_Servicio_VistaConslta.md](.agent/10.5_Servicio_VistaConslta.md)
4. [03_Interfaz_General.md](.agent/03_Interfaz_General.md)
5. Config real: 
   1. [traceability_schema.yaml](traceability_schema.yaml) 
   2. [fases_execution_runners.yaml](fases_execution_runners.yaml) 
   3. [60_deploy-api.http](60_deploy-api.http) 
   4. [confg.yaml](confg.yaml) 
   5. [.env.example](.env.example)

## Resumen actual
- Backend: FastAPI en Python.
- Frontend: React con Vite en `fronted/`.
- Infraestructura: Docker y Docker Compose.
- Persistencia ligera: SQLite.
- UI: Tailwind CSS + Shadcn UI.
- Datos reactivos: TanStack Query.
- Linaje: React Flow.
- Logs: SSE + ANSI.
- Terminal remota: Xterm.js + WebSockets.
- Cliente GitHub: `httpx`.

## Mapa funcional
- Vista 1: dashboard y grafo de linaje.
- Vista 2: consulta, ejecución y cola.
- Vista 3: logs de jobs.
- Vista 4: control de runners y terminales.

## Reglas de trabajo
- Revisar primero la documentación de `.agent` y luego los YAML de configuración.
- Mantener los cambios pequeños y coherentes con el stack decidido.
- No asumir servicios extra ni persistencia adicional si no está documentada.
- Si se modifica un archivo con contenido real, guardar antes una copia en `.agent/waste/`.
- Si el archivo estaba vacío, no hace falta backup.

## Estado de módulos
- [00_App.md](.agent/00_App.md): legado histórico.
- [10_Servicio_VistaConslta.md](.agent/10_Servicio_VistaConslta.md): especificación canónica de la vista 2.
- [20_Servicio2_JerarquiaVariante-fase.md](.agent/20_Servicio2_JerarquiaVariante-fase.md): pendiente.
- [30_Servicio3_logsRunners.md](.agent/30_Servicio3_logsRunners.md): pendiente.
- [40_Servicio4_ctrl_endebidos.md](.agent/40_Servicio4_ctrl_endebidos.md): pendiente.

## Regla práctica
- Si una tarea toca formularios, estados, colas, dependencias o dispatch a GitHub, usar [10_Servicio_VistaConslta.md](.agent/10_Servicio_VistaConslta.md).
- Si toca estructura general, usar [01_Stack.md](.agent/01_Stack.md) y [02_Proyect_Structure.md](.agent/02_Proyect_Structure.md).
