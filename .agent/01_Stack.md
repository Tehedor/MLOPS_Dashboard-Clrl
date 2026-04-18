# 01 Stack General

Stack actual.

## Base
- Docker y Docker Compose.
- Backend FastAPI en Python.
- Frontend React + Vite en `fronted/`.
- Persistencia SQLite.
- UI Tailwind CSS + Shadcn UI.
- Estado TanStack Query.
- GitHub con `httpx`.
- Linaje con React Flow.
- Logs por SSE y ANSI.
- Terminal remota con Xterm.js + WebSockets.

## Reglas
- Mantener el backend simple y asíncrono.
- Usar `asyncio.Queue` para la cola MVP; Celery solo si hace falta.
- SSE para logs, WebSockets para interacción con runners.
- No sumar servicios si no aparecen en YAML o especificación.
