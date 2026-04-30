# 40 Servicio 4 — ctrl_endebidos (Vista 4)

Estado: **a implementar**.

Referencias: [01_Stack.md](01_Stack.md), [03_Interfaz_General.md](03_Interfaz_General.md).

---

## Objetivo

Vista de control operativo de los runners remotos. Permite abrir terminales interactivas embebidas (Xterm.js + WebSockets) a cualquier runner configurado, ver su estado de conexión y gestionar varias sesiones simultáneas.

---

## Configuración de runners

Los runners se configuran en `config.yaml` bajo la clave `TERMINAL_RUNNERS`. Cada runner corre **ttyd** expuesto mediante un túnel Cloudflare.

```yaml
TERMINAL_RUNNERS:
  runner1:
    url: RUNNER1_URL          # en mayúsculas sin "" → leer de .env
    username: RUNNER1_USERNAME
    password: RUNNER1_PASSWORD
  runner2:
    url: RUNNER2_URL
    username: "runner"        # entre "" → valor literal, no de .env
    password: RUNNER2_PASSWORD
```

**Regla de resolución de valores:**
- Valor en MAYÚSCULAS sin comillas → nombre de variable de entorno; leer de `.env`.
- Valor entre comillas (`"runner"`) → literal, usarlo tal cual.

El número de runners es variable; el sistema debe funcionar con N runners sin cambiar código.

---

## Arquitectura de la conexión

ttyd expone ya un WebSocket de terminal en la URL del runner. El backend actúa como proxy WebSocket para que el frontend nunca conozca las credenciales ni las URLs reales.

```
Frontend (Xterm.js)
      ↕ WebSocket  ws://backend/ws/terminal/{runner_id}
Backend FastAPI (proxy WS)
      ↕ WebSocket  wss://{runner_url}/ws  (con Basic Auth)
Runner remoto (ttyd + túnel Cloudflare)
```

- El backend recibe la conexión WS del frontend, abre otra WS al ttyd del runner con las credenciales inyectadas, y hace bridge bidireccional de frames.
- Al cerrar cualquiera de los dos lados, el otro se cierra también.
- Un runner puede tener varias sesiones simultáneas (pestañas distintas).

---

## Interfaz

### Layout general

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo]   Vista1  Vista2  Vista3  [Vista4]        [Repo ↗]   │
├──────────────┬──────────────────────────────────────────────┤
│ RUNNERS      │  [Área de terminales]                        │
│   (sidebar)  │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### Sidebar de runners (izquierda, ~220 px, fija)

Muestra todos los runners leídos de `config.yaml`. Para cada uno:

```
● runner1          [Conectar]
  1 sesión activa
─────────────────────────────
○ runner2          [Conectar]
  sin sesiones
```

- **Indicador de estado**: `●` verde = al menos 1 sesión activa, `◑` amarillo = conectando, `○` gris = sin sesiones, `✕` rojo = último intento fallido.
- **Botón "Conectar"**: abre una nueva pestaña en el área de terminales para ese runner.
- Clic en el nombre de un runner con sesión activa → enfoca su pestaña.
- El sidebar no edita configuración.

### Área de terminales (derecha)

**Modo pestaña (por defecto):**

```
┌──────────────────────────────────────────────────────────┐
│  ● runner1 ×  │  ● runner2 ×  │  ● runner1 #2 ×  │ [＋] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ubuntu@runner1:~$ _                                     │
│                                                          │
│                 [terminal xterm.js]                      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [Clear]  [Ctrl+C]  [Reconectar]    runner1 │ 00:03:21  │
└──────────────────────────────────────────────────────────┘
```

- Cada pestaña = una sesión WebSocket independiente.
- `×` cierra la pestaña y termina la sesión.
- `＋` abre un selector para elegir a qué runner conectar.
- Se puede abrir más de una sesión al mismo runner (sufijo `#2`, `#3`…).

**Modo split (2 paneles, toggle):**

Botón `⬜⬜ Split` en la barra de pestañas divide el área en dos columnas, cada una con sus propias pestañas independientes. Útil para ver dos runners en paralelo.

```
┌────────────────────────┬─────────────────────────┐
│  ● runner1 ×  │  [＋]  │  ● runner2 ×  │  [＋]   │
├────────────────────────┼─────────────────────────┤
│  $ _                   │  $ _                    │
│                        │                         │
├────────────────────────┼─────────────────────────┤
│ [Clear][Ctrl+C][Recon] │ [Clear][Ctrl+C][Recon]  │
└────────────────────────┴─────────────────────────┘
```

Split fijo horizontal (2 columnas). Sin tiling libre.

### Acciones por terminal (barra inferior de cada panel)

- **Clear**: limpia el buffer visual de Xterm.js, sin afectar el proceso remoto.
- **Ctrl+C**: envía `\x03` al WebSocket del runner.
- **Reconectar**: cierra el WS actual y abre uno nuevo al mismo runner.
- Indicador: nombre del runner + tiempo de sesión activa.

### Estados de la terminal

| Estado       | Pestaña                  | Contenido del panel                       |
|--------------|--------------------------|-------------------------------------------|
| Conectando   | `◑ runner1` (spinner)    | "Conectando a runner1…"                   |
| Conectado    | `● runner1`              | prompt del runner (ttyd activo)           |
| Desconectado | `○ runner1` (atenuado)   | "Sesión cerrada." + botón [Reconectar]    |
| Error        | `✕ runner1` (rojo)       | mensaje de error + botón [Reconectar]     |

---

## Contrato backend

### WebSocket proxy

```
WS /ws/terminal/{runner_id}
```

- `runner_id`: clave en `TERMINAL_RUNNERS` (e.g. `runner1`).
- El backend valida que `runner_id` exista en config antes de conectar al runner.
- Abre una WS al ttyd del runner con Basic Auth (`username:password`).
- Hace bridge bidireccional de frames (texto y binario).
- Cierra ambos lados si cualquiera desconecta.

### REST auxiliar

```
GET /api/runners
```

Devuelve la lista de runners y número de sesiones activas. No expone URLs ni credenciales.

```json
[
  { "id": "runner1", "label": "runner1", "active_sessions": 1 },
  { "id": "runner2", "label": "runner2", "active_sessions": 0 }
]
```

---

## Ficheros a crear

### Backend
- `backend/app/api/routers/terminal.py` — WS proxy + GET `/api/runners`.
- `backend/app/services/terminal_service.py` — bridge WS↔WS, contador de sesiones.

### Frontend
- `fronted/src/pages/Vista4.jsx` — página con sidebar + área de terminales.
- `fronted/src/features/terminal/RunnerSidebar.jsx` — lista de runners con estado.
- `fronted/src/features/terminal/TerminalTabs.jsx` — gestor de pestañas y modo split.
- `fronted/src/features/terminal/TerminalPane.jsx` — instancia Xterm.js + WS + barra inferior.
- `fronted/src/api/terminal.js` — helpers WS y GET `/api/runners`.

---

## Dependencias a añadir

- **Frontend**: `xterm`, `xterm-addon-fit` (redimensionado automático), `xterm-addon-web-links`.
- **Backend**: `websockets` (ya disponible via `starlette`/`fastapi`); para el proxy al ttyd usar `httpx` con soporte WS o `websockets` directamente.

---

## Decisiones de diseño

| Decisión | Elección | Razón |
|---|---|---|
| Tiling libre (arrastrar/redimensionar) | ✗ No | Complejidad alta para ≤ 4 runners |
| Split 2 columnas | ✓ Sí | Cubre el 95 % del caso de uso |
| Pestañas ilimitadas | ✓ Sí | El límite real lo pone el navegador |
| Bridge en backend | ✓ Sí | Credenciales nunca al frontend |
| ttyd como terminal | ✓ Ya configurado | Evita gestionar SSH en el backend |
