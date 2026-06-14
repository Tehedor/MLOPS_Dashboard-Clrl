# 03 Interfaz General

Shell común.

## Layout
- Barra superior con logo a la izquierda.
- Navegación fija para Vista1, Vista2, Vista3 y Vista4.
- Enlace al repo de actions a la derecha.
- Un único área central para la vista activa.

## Reglas
- Mantener la misma chrome en todas las vistas.
- La navegación debe ser ligera; la complejidad vive en el contenido.
- En móvil, compactar sin ocultar acceso a las 4 vistas.
- No mezclar shell global con lógica de cada servicio.

## Contenido por vista
- Vista 1: dashboard y linaje.
- Vista 2: tarjetas de fase a la izquierda y cola/estado a la derecha.
- Vista 3: logs y trazas.
- Vista 4: runners embebidos y control operativo.

## Restricción clave
- La shell nunca debe borrar ni reordenar la estructura interna de la vista 2.

---

## Mejoras aplicadas

### m02 — Dropdowns de navegación en cabecera (DagsHub / MLFlow / GitHub Actions)

**Problema:** Los tres enlaces de la cabecera (DagsHub, MLFlow, GitHub Actions) apuntaban siempre al primer pipeline-proyecto, ignorando el resto.

**Implementación (`fronted/src/components/layout/Shell.jsx`):**
- Se añadió el componente `NavDropdown` que recibe `label` y `urlFn(project)`.
- Lee `_allProjects = Object.entries(pipelinesConfig?.pipelines ?? {})`.
- Si hay un solo proyecto, muestra directamente un `<a>` (sin dropdown).
- Si hay varios, abre un menú al hacer click con la lista de pipelines por nombre (`proj.label || id`).
- URLs no disponibles (`null`) se muestran deshabilitadas con el texto "(no disponible)".
- Cierra el menú al hacer click fuera del componente (`mousedown` en `document`).
- Los tres `<a>` estáticos anteriores fueron reemplazados por `<NavDropdown>` con las funciones URL correspondientes.
