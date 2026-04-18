# 03 Interfaz General

Shell común para todas las vistas.

## Layout
- Barra superior con logo a la izquierda.
- Navegación fija para Vista1, Vista2, Vista3 y Vista4.
- Enlace al repositorio de actions alineado a la derecha.
- Área central única donde se renderiza la vista activa.

## Reglas de UI
- Mantener la misma chrome en todas las vistas para que el usuario no pierda contexto.
- La navegación debe ser ligera; el contenido principal carga la complejidad.
- En móvil, la barra superior debe compactarse sin ocultar el acceso a las cuatro vistas.
- No mezclar la estructura global con la lógica específica de cada servicio.

## Contenido esperado
- Vista 1: dashboard y linaje.
- Vista 2: consulta y cola.
- Vista 3: logs.
- Vista 4: runners embebidos.