# Arreglar direccionamiento del desplegable (esquina superior derecha)

## Descripción

En la esquina superior derecha de la aplicación añadir/ajustar un desplegable que liste las pipelines por su nombre. Al seleccionar una pipeline desde ese desplegable debe abrirse la página correspondiente en GitHub Actions. El mismo comportamiento deberá aplicarse a las otras dos opciones relacionadas (por ejemplo: otra integración o destino equivalente).

## Objetivo

- Mejorar la navegación directa desde la app hacia la ejecución/registro de cada pipeline en GitHub Actions.
- Evitar que el usuario tenga que buscar manualmente la pipeline en GitHub.

## Criterios de aceptación

- El desplegable muestra todas las pipelines (nombre legible).
- Al hacer click en un nombre, se abre la URL de GitHub Actions correspondiente en una nueva pestaña.
- Si no hay URL asociada, mostrar un estado deshabilitado o un mensaje "Enlace no disponible".

---

## Implementación — 2026-06-09

**Archivo:** `fronted/src/components/layout/Shell.jsx`

**Componente `NavDropdown({ label, urlFn })`:**
- Lee `_allProjects = Object.entries(pipelinesConfig?.pipelines ?? {})`.
- Si hay un solo proyecto: renderiza directamente un `<a>` (sin menú) — sin overhead innecesario.
- Si hay múltiples: botón con `▾` que al hacer click abre un menú flotante (`z-50`, posición `right-0 top-full`).
- Cada item usa `proj.label || id` como nombre legible.
- `urlFn(proj)` retorna la URL específica de esa pipeline o `null`.
- Items sin URL se muestran grises con "(no disponible)" y son no-clicables.
- Cierre automático al hacer click fuera: `mousedown` listener en `document` + `useRef`.

**Los tres `<a>` estáticos eliminados** y reemplazados por:
```jsx
<NavDropdown label="DagsHub"        urlFn={(p) => p.dagshub_repository ?? null} />
<NavDropdown label="MLFlow"         urlFn={(p) => p.mlflow_tracking_uri ?? null} />
<NavDropdown label="GitHub Actions" urlFn={(p) => p.repo ? `https://github.com/${p.repo}` : null} />
```

Cada pipeline usa su propia URL configurada en `config/pipelines.yaml` a través del alias `@pipelinesConfig`.
