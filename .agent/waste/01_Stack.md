- [1. Stack General (Arquitectura e Infraestructura)](#1-stack-general-arquitectura-e-infraestructura)
- [2. Stack Específico por Servicio/Vista](#2-stack-específico-por-serviciovista)
  - [A. Vista Inicio (Dashboard y Grafo de Linaje)](#a-vista-inicio-dashboard-y-grafo-de-linaje)
  - [B. Vista Consulta (Control de Fases y Buffer)](#b-vista-consulta-control-de-fases-y-buffer)
  - [C. Vista Jobs Logs (Estilo GitHub Actions)](#c-vista-jobs-logs-estilo-github-actions)
  - [D. Vista Control de Runners (ESP32)](#d-vista-control-de-runners-esp32)

---

### 1. Stack General (Arquitectura e Infraestructura)

Estas son las tecnologías base que sostendrán toda la aplicación, independientemente de la vista en la que esté el usuario.

* **Infraestructura:** **Docker & Docker Compose**
    * *Descripción:* Para empaquetar tu frontend y backend en contenedores separados, garantizando que funcione igual en local o en un servidor externo.
* **Backend (Servidor):** **FastAPI (Python)**
    * *Descripción:* Framework moderno, rápido y asíncrono. Ideal para gestionar llamadas concurrentes a la API de GitHub y manejar la lógica de MLOps.
* **Almacenamiento (Estado local):** **SQLite**
    * *Descripción:* Base de datos ligera e integrada en Python. Perfecta para guardar el estado del buffer (cola de trabajos) y el histórico de variantes sin necesidad de levantar un contenedor de base de datos pesado como PostgreSQL.
* **Frontend (Cliente):** **React (usando Vite)**
    * *Descripción:* Librería líder para interfaces de usuario dinámicas. Vite se usa como empaquetador para que el entorno de desarrollo sea ultrarrápido.
* **Estilos y Componentes UI:** **Tailwind CSS + Shadcn UI**
    * *Descripción:* Tailwind te permite maquetar rapidísimo usando clases de utilidad. Shadcn UI te da componentes preconstruidos (botones, modales, pestañas) con un diseño profesional y muy limpio.
* **Gestión de Estado y Polling (Spinners):** **TanStack Query (React Query)**
    * *Descripción:* El "cerebro" de las peticiones en el frontend. Se encarga de preguntar constantemente al backend por el estado de los jobs y gestiona automáticamente las variables para mostrar los *spinners* (`isLoading`) o los errores.
* **Cliente HTTP (Backend -> GitHub):** **`httpx`**
    * *Descripción:* Librería asíncrona de Python para hacer las peticiones REST a la API de GitHub Actions (enviar los *payloads* y consultar estados) sin bloquear el servidor.

---

### 2. Stack Específico por Servicio/Vista

Aquí detallamos las librerías especializadas que resolverán los problemas concretos de cada pestaña de tu interfaz.

#### A. Vista Consulta (Control de Fases y Buffer)
*Objetivo: Formularios para disparar fases, y tablas para gestionar la cola (evitando el límite de 20 jobs de GitHub).*

* **Encolamiento (Backend):** **`asyncio.Queue` (Nativo en Python) o Celery**
    * *Descripción:* Recibe todas las peticiones de los usuarios. Si hay más de 20 jobs en GitHub, los retiene aquí y los va soltando poco a poco a la API de GitHub Actions.
* **Gestión de Formularios:** **React Hook Form**
    * *Descripción:* Para crear los formularios de cada fase (donde metes los parámetros de las variantes). Valida los datos y los envía al backend de forma eficiente.
* **Visualización del Buffer/Cola:** **TanStack Table (React Table)**
    * *Descripción:* Una librería "headless" para construir tablas de datos complejas. Te permitirá ver qué variantes están pendientes, en ejecución o fallidas, con opciones de filtrado y paginación.

#### B. Vista Inicio (Dashboard y Grafo de Linaje)
*Objetivo: Visualizar las variantes ejecutadas, sus parámetros, relaciones parent-child y su estado en vivo.*

* **Visualización del Grafo:** **React Flow**
    * *Descripción:* Sustituye a `leader-line.js`. Es un framework para construir diagramas interactivos basados en nodos. Lee tu JSON de dependencias y dibuja el árbol automáticamente, permitiendo hacer zoom, arrastrar nodos y cambiar sus colores (verde/rojo) según el estado del job.
* **Panel Lateral (Configuración):** **Componente `Sheet` o `Drawer` (de Shadcn UI)**
    * *Descripción:* Para replicar tu panel lateral que se desliza (`#config-panel`), mostrando el JSON de parámetros cuando haces clic en una variante del grafo.


#### C. Vista Jobs Logs (Estilo GitHub Actions)
*Objetivo: Ver los pasos de los workflows y los logs en tiempo real extraídos de GitHub.*

* **Renderizado de Logs ANSI:** **`ansi-to-react` (o `react-lazylog`)**
    * *Descripción:* Transforma el texto crudo devuelto por GitHub (que viene con códigos de color de terminal como `\u001b[31m`) en componentes HTML con los colores correctos. `react-lazylog` además permite hacer *scroll* infinito sin congelar la pantalla.
* **Estructura de Pasos (Steps):** **Componente `Accordion` (de Shadcn UI)**
    * *Descripción:* Permite agrupar los logs por "pasos" que el usuario puede desplegar y colapsar, imitando la interfaz nativa de GitHub Actions.
* **Transmisión de Logs (Backend -> Frontend):** **Server-Sent Events (SSE)**
    * *Descripción:* Una tecnología nativa (no requiere librería extra) que permite a FastAPI enviar texto de logs al frontend a medida que GitHub los va generando, creando el efecto de que el log "fluye" en pantalla.

#### D. Vista Control de Runners (ESP32)
*Objetivo: Terminal en vivo conectada a los dispositivos de hardware/runners autoalojados.*

* **Emulador de Terminal:** **Xterm.js**
    * *Descripción:* Recrea una terminal real en el navegador (es la misma que usa VS Code). Soporta entrada de teclado y renderizado de altísimo rendimiento.
* **Comunicación en Tiempo Real:** **WebSockets (FastAPI `WebSocket` + nativo JS)**
    * *Descripción:* A diferencia de SSE (que es de una sola vía), los WebSockets permiten comunicación bidireccional. Ideal si necesitas ver el output del ESP32, pero también enviarle comandos manuales desde el navegador.

---

¿Te parece bien esta estructura? Si estás de acuerdo con el mapa, ¿por dónde te gustaría empezar a "picar" código? Podríamos diseñar el esqueleto del `docker-compose.yml` o hacer una prueba rápida del sistema de colas en FastAPI.