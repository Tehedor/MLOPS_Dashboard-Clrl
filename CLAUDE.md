# Claude.md

Índice mínimo del proyecto. Leer esto primero y luego solo lo necesario.

## Approach
- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100KB unless explicitly required.
- Suggest running /cost when a session is running long to monitor cache ratio.
- Recommend starting a new session when switching to an unrelated task.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.


## Orden de lectura
1. [01_Stack.md](.agent/01_Stack.md)
2. [02_Proyect_Structure.md](.agent/02_Proyect_Structure.md)
3. [10_Servicio_VistaConslta.md](.agent/10_Servicio_VistaConslta.md)
4. [11_Servicio_VistaConslta_Componentes.md](.agent/11_Servicio_VistaConslta_Componentes.md)
5. [03_Interfaz_General.md](.agent/03_Interfaz_General.md)
6. YAML reales si hace falta: [traceability_schema.yaml](traceability_schema.yaml), [fases_execution_runners.yaml](fases_execution_runners.yaml), [60_deploy-api.http](60_deploy-api.http), [confg.yaml](confg.yaml), [.env.example](.env.example)

## Qué leer según la tarea
- Stack, despliegue o decisiones técnicas: [01_Stack.md](.agent/01_Stack.md) + YAML reales.
- Estructura de carpetas o naming: [02_Proyect_Structure.md](.agent/02_Proyect_Structure.md).
- Formularios, colas, dependencias o dispatch GitHub: [10_Servicio_VistaConslta.md](.agent/10_Servicio_VistaConslta.md).
- Wireframes, layout y anatomía de componentes de Vista 2: [11_Servicio_VistaConslta_Componentes.md](.agent/11_Servicio_VistaConslta_Componentes.md).
- Shell global/UI común: [03_Interfaz_General.md](.agent/03_Interfaz_General.md).

## Secuencia de trabajo
- Buscar contexto con `search_subagent` antes de leer demasiado.
- Leer con `read_file` solo los docs necesarios.
- Editar con `apply_patch`.
- Validar con `get_errors` o `get_changed_files` si tocaste código o docs.
- Si un archivo no estaba vacío y lo cambias, guardar copia en `.agent/waste/` antes de editar.

## Mapa mínimo
- 01_Stack: stack actual.
- 02_Proyect_Structure: árbol lógico real.
- 03_Interfaz_General: shell.
- 10_Servicio_VistaConslta: vista 2 — contratos, estados y lógica.
- 11_Servicio_VistaConslta_Componentes: wireframes y anatomía de componentes de Vista 2.
- 20, 30, 40: pendientes; no leer salvo necesidad explícita.
