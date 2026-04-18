# Fronted
```bash
frontend/
├── src/
│   ├── api/                # Configuración global de peticiones (ej. Axios instanciado)
│   │
│   ├── components/         # 🎨 SISTEMA DE DISEÑO GLOBAL (Shadcn UI + Tailwind)
│   │   ├── ui/             # Botones, Inputs, Spinners, Modales, Accordions
│   │   └── layout/         # Sidebar de navegación, Header superior
│   │
│   ├── features/           # 🚀 EL CORAZÓN MODULAR (Tus Vistas)
│   │   │
│   │   ├── lineage/        # -> VISTA 1: Inicio (React Flow)
│   │   │   ├── components/ # Nodos personalizados, Panel lateral de config
│   │   │   ├── hooks/      # Lógica de cálculo de ancestros/descendientes
│   │   │   └── api/        # Peticiones específicas para traer el JSON del grafos
│   │   │   └── __mocks__/
│   │   │       └── data.json        
│   │   │
│   │   ├── execution/      # -> VISTA 2: Consulta (Formularios y Buffer)
│   │   │   ├── components/ # Formularios de fases (F1, F2...), Tabla de TanStack
│   │   │   └── hooks/      # Mutaciones (TanStack Query) para disparar jobs
│   │   │   └── __mocks__/
│   │   │       └── data.json
│   │   │
│   │   ├── logs/           # -> VISTA 3: Jobs Logs
│   │   │   └── components/ # Tarjetas expansibles, Visor de texto ANSI
│   │   │   └── __mocks__/
│   │   │       └── data.json
│   │   └── runners/        # -> VISTA 4: Control de ESP32
│   │       └── components/ # Instancia de Xterm.js y conexión WebSocket
│   │       └── __mocks__/
│   │           └── data.json
│   │
│   ├── pages/              # 🗺️ ENSAMBLAJE FINAL
│   │   ├── HomePage.jsx    # Importa Layout + feature/lineage
│   │   ├── ExecutePage.jsx # Importa Layout + feature/execution
│   │   └── LogsPage.jsx    # Importa Layout + feature/logs
│   │
│   ├── utils/              # Funciones helper genéricas (formateo de fechas, etc.)
│   ├── App.jsx             # Router principal (React Router)
│   └── main.jsx            # Punto de entrada 
```

# Backend
```bash 
backend/
├── app/
│   ├── main.py             # Punto de entrada, une todos los routers y configura CORS
│   │
│   ├── api/                # 🌐 RUTAS (Endpoints)
│   │   ├── routers/
│   │   │   ├── lineage.py  # GET /api/lineage (Devuelve el árbol de variantes)
│   │   │   ├── trigger.py  # POST /api/trigger/fase1 (Mete a la cola el job)
│   │   │   └── logs.py     # GET /api/logs/{job_id} y WebSockets
│   │   │
│   ├── core/               # Configuración global
│   │   ├── config.py       # Variables de entorno (Token de GitHub, URLs)
│   │   └── queue.py        # Configuración del Buffer/Cola en memoria
│   │
│   ├── schemas/            # 📦 MODELOS DE DATOS (Pydantic)
│   │   ├── payload.py      # Validación de qué datos son obligatorios por fase
│   │   └── github.py       # Modelos para parsear las respuestas de la API de GitHub
│   │
│   └── services/           # 🧠 LÓGICA DE NEGOCIO PESADA
│       ├── github_api.py   # Funciones httpx puras para hablar con GitHub
│       └── runner_mgr.py   # Conexión SSH/Websocket con los ESP32
│
├── requirements.txt
└── Dockerfile
```