# 02 Proyect Structure

Estructura lógica alineada con el stack actual y con los nombres reales del repo.

## Backend
```bash
backend/
├── app/
│   ├── main.py
│   ├── api/
│   │   └── routers/
│   │       ├── lineage.py
│   │       ├── trigger.py
│   │       └── logs.py
│   ├── core/
│   │   ├── config.py
│   │   └── queue.py
│   ├── schemas/
│   │   ├── payload.py
│   │   └── github.py
│   └── services/
│       ├── github_api.py
│       └── runner_mgr.py
├── requirements.txt
└── Dockerfile
```

## Frontend
```bash
fronted/
├── src/
│   ├── api/
│   ├── components/
│   │   ├── ui/
│   │   └── layout/
│   ├── features/
│   │   ├── lineage/
│   │   ├── execution/
│   │   ├── logs/
│   │   └── runners/
│   ├── pages/
│   ├── utils/
│   ├── App.jsx
│   └── main.jsx
```

## Raíz del proyecto
- [traceability_schema.yaml](traceability_schema.yaml)
- [fases_execution_runners.yaml](fases_execution_runners.yaml)
- [60_deploy-api.http](60_deploy-api.http)
- [confg.yaml](confg.yaml)
- [.env.example](.env.example)

## Reglas
- Mantener la lógica de negocio específica de cada vista dentro de su feature.
- Compartir UI genérica en `components/ui` y `components/layout`.
- No duplicar contratos de fase fuera de los YAML de configuración.
- Si crece el sistema, separar por dominio antes que por tipo de archivo.