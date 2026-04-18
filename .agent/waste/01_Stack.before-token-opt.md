# 01 Stack General

Fuente de verdad del stack actual.

## Stack base
- Infraestructura: Docker y Docker Compose.
- Backend: FastAPI en Python.
- Frontend: React con Vite, alojado en `fronted/`.
- Persistencia ligera: SQLite.
- UI: Tailwind CSS + Shadcn UI.
- Estado reactivo: TanStack Query.
- Cliente HTTP hacia GitHub: `httpx`.
- Grafo de linaje: React Flow.
- Logs en tiempo real: SSE + renderizado ANSI.
- Terminal remota: Xterm.js + WebSockets.

## Decisiones operativas
- El backend debe mantenerse simple y asíncrono.
- La cola MVP debe resolverse con `asyncio.Queue`; Celery solo entra si el crecimiento lo justifica.
- SSE es la vía estándar para logs; WebSockets quedan para interacción bidireccional con runners.
- No añadir servicios extra si no están explicitados en los YAML y en la especificación de la vista.

## Prioridad
1. Mantener el MVP reproducible con Docker Compose.
2. Reducir dependencia de estado oculto.
3. Centralizar la configuración en YAML y `.env`.