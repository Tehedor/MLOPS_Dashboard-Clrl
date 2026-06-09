# Creación de files personalizados para cada una de las pipelines

Genera los 5 archivos de configuración en `config/<pipeline_slug>/` para una pipeline registrada en `config/pipelines.yaml`.

```yml
# Ejemplo de entrada en config/pipelines.yaml
pipelines:
  testPipelineEpoch:
    label: "Test Pipeline Epoch"
    color: "#6366f1"
    repo: "Tehedor/MLOps_actions_v2"
    branch: "test2"
    external_base: "external/testPipelineEpoch"
    traceability_path: "config/testPipelineEpoch/traceability_schema.yaml"
    init_marker: ".mlops4ofp"
    command_start: "make setup SETUP_CFG=setup/remote3.yaml"
    mlflow_tracking_uri: "https://dagshub.com/Tehedor/MLOps_actions_v2.mlflow"
    dagshub_repository: "https://dagshub.com/Tehedor/MLOps_actions_v2"
    github_token_env: "GITHUB_TOKEN"
    table_config: "config/testPipelineEpoch/table_config.yaml"
    local_workflows: "config/testPipelineEpoch/local_workflows.yaml"
    services_external_ctrl: "config/testPipelineEpoch/services_external_ctrl.yaml"
    fase_runners: "config/testPipelineEpoch/fase_runners.yaml"
    lineage_config: "config/testPipelineEpoch/lineage_config.yaml"
```

---

## Proceso

### Paso 1 — Identificar el pipeline objetivo

Si el usuario pasó un slug como argumento, úsalo directamente.  
Si no, lee `config/pipelines.yaml`, lista los slugs disponibles y pide al usuario que elija uno.

### Paso 2 — Leer la entrada en config/pipelines.yaml

Lee `config/pipelines.yaml` y extrae del slug elegido:
- `slug` (clave del mapa, e.g. `mlops4rtedge`)
- `repo` (e.g. `TeheORG/mlops4rtedge`)
- `external_base` (e.g. `external/mlops4rtedge`)
- `branch`

### Paso 3 — Localizar el repositorio fuente

Prueba en este orden y usa la primera ruta que exista y tenga contenido:

1. **`external/<external_base>/repo_actions/`** — el repo clonado del pipeline. Es la ubicación estándar.
2. **`repo_backup/<slug>/`** o **`repo_backup/<nombre-del-repo>/`** — si existe la carpeta `repo_backup/` en la raíz del proyecto y contiene el repo.
3. **Manual** — si ninguno de los anteriores existe, para y pregunta al usuario:  
   _"No encuentro el repo local de `<repo>`. ¿Puedes indicarme la ruta donde está clonado?"_

A partir de aquí, llama `$REPO` a la ruta localizada.

### Paso 4 — Explorar el repo para inferir el contenido de cada file

#### Para fase_runners.yaml
- Lee `config/fases_execution_runners.yaml` para obtener los runners disponibles y sus labels.
- Lee `$REPO/.github/workflows/` buscando archivos `reusable_faseN-*.yml` para descubrir las fases y sus nombres en GH Actions (`gh_fase`).
- Regla de runners: fases que impliquen hardware físico (palabras clave: `esp32`, `edge`, `hardware`, `embedded`) → solo `ESP32-self-hosted, Local`. El resto → todos los runners cloud (k8s, GH) más `Local`.
- `parent_required`: false para f01 (raíz), true para todas las demás.

#### Para lineage_config.yaml
- Las fases vienen de las workflows descubiertas arriba.
- `parent_keys`: `[]` para f01, `[["parameters", "parent_variant"]]` para f02-f07, `[["parameters", "parents"]]` para fases tipo sysval (múltiples padres).
- Asigna colores del degradado del template de referencia (una fase, un color).

#### Para local_workflows.yaml
- Lee `$REPO/Makefile` y extrae los targets disponibles por fase.
- Para cada fase, mapea los targets a los 4 steps estándar: `variant`, `script`, `check`, `register`.
- Usa las variables de interpolación según la fase: `{parent_id}` para fases f02-f07, `{parents_ids}` para la última fase (múltiples padres), `{catalog_id}` solo si la fase lo necesita (habitualmente f04).
- `dvc_pull`: sigue el patrón `executions/<fase_padre>/{parent_id}/*.dvc`.

#### Para table_config.yaml — el más complejo
- Para cada fase, busca una variante ejecutada en `$REPO/executions/<fase>/` (o `external/<external_base>/repo_actions/executions/<fase>/`).
- Si hay variantes, lee el `params.yaml` y el `output.yaml` de una de ellas para extraer los campos reales con sus rutas YAML (`source_path`).
- Si no hay variantes ejecutadas, genera solo `base_columns: [variant]` y añade un comentario `# TODO: completar columnas cuando haya variantes ejecutadas`.

#### Para services_external_ctrl.yaml
- Busca `$REPO/services/` para descubrir servicios existentes. Cada subdirectorio suele ser un servicio.
- Si no hay directorio `services/`, genera el archivo con estructura vacía y un comentario `# No se detectaron servicios en el repo`.

### Paso 5 — Crear los archivos

1. Crea el directorio `config/<slug>/` si no existe.
2. Escribe los 5 archivos: `fase_runners.yaml`, `lineage_config.yaml`, `local_workflows.yaml`, `services_external_ctrl.yaml`, `table_config.yaml`.
3. Verifica que la entrada del pipeline en `config/pipelines.yaml` apunta a los paths correctos para los 5 archivos. Si alguna clave falta, añádela.

---

## Directorios

.<pipeline name>
├── fase_runners.yaml
├── lineage_config.yaml
├── local_workflows.yaml
├── services_external_ctrl.yaml
└── table_config.yaml


## Ejemplo templates


### fase_runners.yaml
Los runners disponbiles se sacarán de config/fases_execution_runners.yaml.
Por un lado por defecto los runners de k8s y de github se usarán siempre para todas las fases, a no ser de que dependan de una esp32 que depednerán únicamente de este tipo de repositorios.

Por otro lado, todas las fases dependerán del local

#### Template
```yml
# Phase → runner assignment for testPipelineEpoch.
# Runner definitions (labels, max-parallel) live in config/fases_execution_runners.yaml.

fases:
  - fase: f01_explore
    runner: "GithubActions, K8s-8gb, K8s-24gb, Local"
    gh_fase: "f01_explore"
    parent_required: false
  - fase: f02_events
    runner: "GithubActions, K8s-8gb, K8s-24gb, Local"
    gh_fase: "f02_events"
    parent_required: true
  - fase: f03_windows
    runner: "GithubActions, K8s-8gb, K8s-24gb, Local"
    gh_fase: "f03_windows"
    parent_required: true
  - fase: f04_targets
    runner: "GithubActions, K8s-8gb, K8s-24gb, Local"
    gh_fase: "f04_targets"
    parent_required: true
  - fase: f05_modeling
    runner: "GithubActions,K8s-8gb, K8s-24gb, Local"
    gh_fase: "f05_modeling"
    parent_required: true
  - fase: f06_quant
    runner: "GithubActions, K8s-8gb, K8s-24gb, Local"
    gh_fase: "f06_quant"
    parent_required: true
  - fase: f07_modval
    runner: 'ESP32-self-hosted, Local'
    gh_fase: "f07_modval"
    parent_required: true
  - fase: f08_sysval
    runner: "ESP32-self-hosted, Local"
    gh_fase: "f08_sysval"
    parent_required: true
```


### lineage_config.yaml

#### Template
```yml
# Lineage visualization config for mlops4rtedge.
# parent_keys: YAML path(s) inside params.yaml that hold the parent variant id.

phases:
  - name: f01_explore
    label: "F01 Explore"
    parent_keys: []
    metadata: ["metadata.yaml"]
    color: {bg: "#E3F2FD", border: "#90CAF9", text: "#1565C0"}

  - name: f02_events
    label: "F02 Events"
    parent_keys: ["parent"]
    metadata: ["metadata.yaml"]
    color: {bg: "#E8F5E9", border: "#A5D6A7", text: "#2E7D32"}

  - name: f03_windows
    label: "F03 Windows"
    parent_keys: [["parameters", "parent_variant"]]
    metadata: ["metadata.yaml"]
    color: {bg: "#FFF3E0", border: "#FFCC80", text: "#EF6C00"}

  - name: f04_targets
    label: "F04 Targets"
    parent_keys: [["parameters", "parent_variant"]]
    metadata: ["metadata.yaml"]
    color: {bg: "#F3E5F5", border: "#CE93D8", text: "#6A1B9A"}

  - name: f05_modeling
    label: "F05 Modeling"
    parent_keys: [["parameters", "parent_variant"]]
    metadata: ["metadata.yaml"]
    color: {bg: "#FFEBEE", border: "#EF9A9A", text: "#C62828"}

  - name: f06_quant
    label: "F06 Quant"
    parent_keys: [["parameters", "parent_variant"]]
    metadata: ["metadata.yaml"]
    color: {bg: "#E0F7FA", border: "#80DEEA", text: "#006064"}

  - name: f07_modval
    label: "F07 ModVal"
    parent_keys: [["parameters", "parent_variant"]]
    metadata: ["metadata.yaml"]
    color: {bg: "#ECEFF1", border: "#B0BEC5", text: "#37474F"}

  - name: f08_sysval
    label: "F08 SysVal"
    parent_keys: [["parameters", "parents"]]
    metadata: ["metadata.yaml"]
    color: {bg: "#F9FBE7", border: "#E6EE9C", text: "#827717"}
```


### local_workflows.yaml

#### Template
```yml
# Definición de los pasos que ejecuta el runner Local por fase.
# El runner local clona el repo en `local_runner_workspace` y ejecuta
# estos pasos secuencialmente dentro de ese directorio.
#
# Variables disponibles en los comandos:
#   {variant_id}       — ej. v0001
#   {checkout_branch}  — rama de checkout (ej. test2)
#   {params_json}      — JSON con los params (ej. '{"lr": 0.01}')
#   {workspace}        — ruta absoluta al clon local del runner
#   {parent_id}        — variante padre directa (fases 2–7)
#   {catalog_id}       — variante catálogo de f02 (solo f04)
#   {parents_ids}      — JSON list de variantes padre (solo f08, ej. '["v7_0001"]')
#
# Cada step tiene:
#   name          — label para logs/UI
#   type          — make | shell | dvc
#   cmd           — comando a ejecutar (interpolado con las variables)
#   commit_paths  — paths a incluir en el commit/PR tras el step (opcional)
#   step_id       — id para el PR (mismo naming que commit-and-pr action)
#   always_run    — si true, se ejecuta aunque un step anterior haya fallado
#   publish_pr    — si true, crea PR y hace merge igual que el workflow de GH

fases:
  - fase: f01_explore
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - data/raw.csv.dvc
    steps:
      - name: "Ejecutar variant1"
        type: make
        cmd: "make variant1 VARIANT={variant_id} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f01_explore/{variant_id}"

      - name: "Ejecutar script1"
        type: make
        cmd: "make script1 VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f01_explore/{variant_id}"

      - name: "Ejecutar check1"
        type: make
        cmd: "make check1 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f01_explore/{variant_id}"

      - name: "Ejecutar register1"
        type: make
        cmd: "make register1 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f01_explore/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"

  - fase: f02_events
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - "executions/f01_explore/{parent_id}/*.dvc"
    steps:
      - name: "Ejecutar variant2"
        type: make
        cmd: "make variant2 VARIANT={variant_id} PARENT={parent_id} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f02_events/{variant_id}"

      - name: "Ejecutar script2"
        type: make
        cmd: "make script2 VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f02_events/{variant_id}"

      - name: "Ejecutar check2"
        type: make
        cmd: "make check2 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f02_events/{variant_id}"

      - name: "Ejecutar register2"
        type: make
        cmd: "make register2 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f02_events/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"

  - fase: f03_windows
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - "executions/f02_events/{parent_id}/*.dvc"
    steps:
      - name: "Ejecutar variant3"
        type: make
        cmd: "make variant3 VARIANT={variant_id} PARENT={parent_id} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f03_windows/{variant_id}"

      - name: "Ejecutar script3"
        type: make
        cmd: "make script3 VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f03_windows/{variant_id}"

      - name: "Ejecutar check3"
        type: make
        cmd: "make check3 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f03_windows/{variant_id}"

      - name: "Ejecutar register3"
        type: make
        cmd: "make register3 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f03_windows/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"

  - fase: f04_targets
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - "executions/f02_events/{catalog_id}/*.dvc"
      - "executions/f03_windows/{parent_id}/*.dvc"
    steps:
      - name: "Ejecutar variant4"
        type: make
        cmd: "make variant4 VARIANT={variant_id} PARENT={parent_id} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f04_targets/{variant_id}"

      - name: "Ejecutar script4"
        type: make
        cmd: "make script4 VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f04_targets/{variant_id}"

      - name: "Ejecutar check4"
        type: make
        cmd: "make check4 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f04_targets/{variant_id}"

      - name: "Ejecutar register4"
        type: make
        cmd: "make register4 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f04_targets/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"

  - fase: f05_modeling
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - "executions/f04_targets/{parent_id}/*.dvc"
    steps:
      - name: "Ejecutar variant5"
        type: make
        cmd: "make variant5 VARIANT={variant_id} PARENT={parent_id} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f05_modeling/{variant_id}"

      - name: "Ejecutar script5"
        type: make
        cmd: "make script5-a VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f05_modeling/{variant_id}"

      - name: "Ejecutar check5"
        type: make
        cmd: "make check5 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f05_modeling/{variant_id}"

      - name: "Ejecutar register5"
        type: make
        cmd: "make register5 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f05_modeling/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"

  - fase: f06_quant
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - "executions/f05_modeling/{parent_id}/*.dvc"
    steps:
      - name: "Ejecutar variant6"
        type: make
        cmd: "make variant6 VARIANT={variant_id} PARENT={parent_id} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f06_quant/{variant_id}"

      - name: "Ejecutar script6"
        type: make
        cmd: "make script6-a VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f06_quant/{variant_id}"

      - name: "Ejecutar check6"
        type: make
        cmd: "make check6 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f06_quant/{variant_id}"

      - name: "Ejecutar register6"
        type: make
        cmd: "make register6 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f06_quant/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"

  - fase: f07_modval
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - "executions/f06_quant/{parent_id}/*.dvc"
    steps:
      - name: "Ejecutar variant7"
        type: make
        cmd: "make variant7 VARIANT={variant_id} PARENT={parent_id} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f07_modval/{variant_id}"

      - name: "Ejecutar script7"
        type: make
        cmd: "make script7 VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f07_modval/{variant_id}"

      - name: "Ejecutar check7"
        type: make
        cmd: "make check7 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f07_modval/{variant_id}"

      - name: "Ejecutar register7"
        type: make
        cmd: "make register7 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f07_modval/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"

  - fase: f08_sysval
    exclude_exts:
      - .h5
      - .parquet
      - .tflite
    dvc_pull:
      - "executions/f07_modval/{parents_ids}/*.dvc"
    steps:
      - name: "Ejecutar variant8"
        type: make
        cmd: "make variant8 VARIANT={variant_id} PARENTS={parents_ids} {make_params}"
        step_id: variant
        publish_pr: true
        commit_paths:
          - "executions/f08_sysval/{variant_id}"

      - name: "Ejecutar script8"
        type: make
        cmd: "make script8 VARIANT={variant_id}"
        step_id: script
        publish_pr: true
        commit_paths:
          - "executions/f08_sysval/{variant_id}"

      - name: "Ejecutar check8"
        type: make
        cmd: "make check8 VARIANT={variant_id}"
        step_id: check
        always_run: true
        publish_pr: true
        commit_paths:
          - "executions/f08_sysval/{variant_id}"

      - name: "Ejecutar register8"
        type: make
        cmd: "make register8 VARIANT={variant_id}"
        step_id: register
        publish_pr: true
        commit_paths:
          - "executions/f08_sysval/{variant_id}"
          - ".dvc/config"
          - "dvc.yaml"
          - "dvc.lock"
```

### services_external_ctrl.yaml

#### Template
```yml
Services:
  mds-dashboard:
    url_repo: https://github.com/Tehedor/MDS-Dashboard
    branch: main
    path: services/temporal_app
    port: 8050
    fases:
      - f01_explore
      - f02_events
    commands:
      - name: "Run Windows App"
        command: "run_temporal_app"
        params:
          - name: "Dataset Variant"
            env_var: VARIANT
            type: string
            placeholder: "dataset_variant"
          # - name: "Epoch Mode"
          #   env_var: EPOCH_MODE
          #   type: select
          #   options:
          #     - "true"
          #     - "false"
      - name: "Stop Windows App"
        command: "stop_temporal_app"
      - name: "Refresh Input Dataset"
        command: "temporal_app_refress_inputDataset"
      - name: "Check Control YAML"
        command: "check_control_yaml"




  windows-app:
    url_repo: https://github.com/Tehedor/windows_event_analyzer
    path: services/windows_app
    branch: main
    port: 8060
    variant_env_var: WINDOW_VERSION   # env var que recibe la variante en el Makefile
    variant_format: direct            # 'direct' = usar variant tal cual (vY_XXXX), sin componer T/E
    fases:
      - f03_windows
    commands:
      - name: "Run Windows App"
        command: "run_windows_app"
      - name: "Stop Windows App"
        command: "stop_windows_app"
```

### table_config.yaml


#### Template
```yml
phases:
  - id: f01_explore
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources:
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: raw_path
            source_path: parameters.raw_path
            type: str
          - id: cleaning
            source_path: parameters.cleaning
            type: str
          - id: nan_values
            source_path: parameters.nan_values
            type: list

      - file: output.yaml
        color: "#ffb3b3"
        columns: 
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: n_rows
            source_path: exports.n_rows
            type: int
          - id: n_columns
            source_path: exports.n_columns
            type: int
          - id: measure_cols
            source_path: exports.measure_cols
            type: list
          - id: execution_time
            source_path: metrics.execution_time
            type: float
          - id: n_nan_detected
            source_path: metrics.n_nan_detected
            type: int
          - id: n_nan_replaced
            source_path: metrics.n_nan_replaced
            type: int
          - id: nan_ratio
            source_path: metrics.nan_ratio
            type: float
          - id: generated_at
            source_path: provenance.generated_at
            type: datetime    

  - id: f02_events   
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parent
            source_path: parent
            type: str
            color: "#fce1fb"
          - id: Tu
            source_path: parameters.Tu
            type: int
          - id: strategy
            source_path: parameters.strategy
            type: str
          - id: bands
            source_path: parameters.bands
            type: list
          - id: nan_mode
            source_path: parameters.nan_mode
            type: str
 

      - file: output.yaml
        color: "#ffb3b3"
        columns:
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: n_events
            source_path: exports.n_events
            type: int
          - id: n_types
            source_path: exports.n_types
            type: int
          - id: execution_time
            source_path: metrics.execution_time
            type: float
          - id: n_rows_in
            source_path: metrics.n_rows_in
            type: int
          - id: n_rows_out
            source_path: metrics.n_rows_out
            type: int
          - id: generated_at
            source_path: provenance.generated_at
            type: datetime


  - id: f03_windows
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parent
            source_path: parent
            type: str
            color: "#fce1fb"
          - id: Tu
            source_path: parameters.Tu
            type: int
          - id: OW
            source_path: parameters.OW
            type: int
          - id: LT
            source_path: parameters.LT
            type: int
          - id: PW
            source_path: parameters.PW
            type: int
          - id: window_strategy
            source_path: parameters.window_strategy
            type: str
          - id: nan_mode
            source_path: parameters.nan_mode
            type: str

      - file: output.yaml
        color: "#ffb3b3"
        columns:
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: OW
            source_path: exports.OW
            type: int
          - id: LT
            source_path: exports.LT
            type: int
          - id: PW
            source_path: exports.PW
            type: int
          - id: event_type_count
            source_path: exports.event_type_count
            type: int 
          - id: window_strategy
            source_path: exports.window_strategy
            type: str 
          - id: nan_mode
            source_path: exports.nan_mode 
            type: str 
          - id: n_windows_out 
            source_path: exports.n_windows_out 
            type: int 
          - id: n_windows_pos
            source_path: exports.n_windows_pos 
            type: int
          - id: n_windows_neg
            source_path: exports.n_windows_neg 
            type: int
          - id: execution_time 
            source_path: metrics.execution_time 
            type: float
          - id: n_events_in 
            source_path: metrics.n_events_in 
            type: int
          - id: n_windows_out_metric
            source_path: metrics.n_windows_out 
            type: int
          - id: positive_ratio 
            source_path: metrics.positive_ratio 
            type: float
          - id: generated_at 
            source_path: provenance.generated_at 
            type: datetime


  - id: f04_targets
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parent
            source_path: parent
            type: str
            color: "#fce1fb"
          - id: Tu
            source_path: parameters.Tu
            type: int
          - id: OW
            source_path: parameters.OW
            type: int
          - id: LT
            source_path: parameters.LT
            type: int
          - id: PW
            source_path: parameters.PW
            type: int
          - id: event_type_count
            source_path: parameters.event_type_count
            type: int
          - id: prediction_name
            source_path: parameters.prediction_name
            type: str
          - id : target_operator
            source_path: parameters.target_operator
            type: str
          - id: target_event_types
            source_path: parameters.target_event_types 
            type: list
      - file: output.yaml
        color: "#ffb3b3"
        columns:
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: OW
            source_path: exports.OW
            type: int
          - id: LT
            source_path: exports.LT
            type: int
          - id: PW
            source_path: exports.PW
            type: int
          - id: event_type_count
            source_path: exports.event_type_count 
            type: int 
          - id: prediction_name
            source_path: exports.prediction_name 
            type: str 
          - id : target_operator
            source_path: exports.target_operator 
            type: str 
          - id: target_event_types
            source_path: exports.target_event_types  
            type: list 
          - id: n_windows 
            source_path: exports.n_windows 
            type: int 
          - id: n_windows_pos
            source_path: exports.n_windows_pos 
            type: int
          - id: n_windows_neg
            source_path: exports.n_windows_neg 
            type: int
          - id: execution_time 
            source_path: metrics.execution_time 
            type: float
          - id: positive_ratio 
            source_path: metrics.positive_ratio 
            type: float
          - id: generated_at 
            source_path: provenance.generated_at 
            type: datetime


  - id: f05_modeling
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parent
            source_path: parent
            type: str
            color: "#fce1fb"
          - id: Tu
            source_path: parameters.Tu
            type: int
          - id: OW
            source_path: parameters.OW
            type: int
          - id: LT
            source_path: parameters.LT
            type: int
          - id: PW
            source_path: parameters.PW
            type: int
          - id: prediction_name
            source_path: parameters.prediction_name
            type: str
          - id: event_type_count
            source_path: parameters.event_type_count 
            type: int 
          - id: model_family
            source_path: parameters.model_family 
            type: str 
          - id: automl_enabled
            source_path: parameters.automl.enabled 
            type: bool 
          - id: automl_max_trials
            source_path: parameters.automl.max_trials 
            type: int 
          - id: automl_seed
            source_path: parameters.automl.seed 
            type: int
          - id: search_space_batch_size
            source_path: parameters.search_space.common.batch_size
            type: list
          - id: search_space_learning_rate
            source_path: parameters.search_space.common.learning_rate
            type: list
          - id: search_space_n_layers
            source_path: parameters.search_space.common.n_layers
            type: list
          - id: search_space_units
            source_path: parameters.search_space.common.units
            type: list
          - id: search_space_dropout
            source_path: parameters.search_space.common.dropout
            type: list
          - id: search_space_embed_dim_dense_bow
            source_path: parameters.search_space.dense_bow.embed_dim
            type: list
          - id: search_space_embed_dim_sequence_embedding
            source_path: parameters.search_space.sequence_embedding.embed_dim
            type: list
          - id: search_space_embed_dim_cnn1d
            source_path: parameters.search_space.cnn1d.embed_dim
            type: list
          - id: search_space_filters_cnn1d
            source_path: parameters.search_space.cnn1d.filters
            type: list
          - id: search_space_kernel_size_cnn1d
            source_path: parameters.search_space.cnn1d.kernel_size
            type: list
          - id: training_epochs
            source_path: parameters.training.epochs
            type: int 
          - id: training_max_samples
            source_path: parameters.training.max_samples
            type: int
          - id: evaluation_split_train
            source_path: parameters.evaluation.split.train
            type: float
          - id: evaluation_split_val
            source_path: parameters.evaluation.split.val
            type: float
          - id: evaluation_split_test
            source_path: parameters.evaluation.split.test
            type: float
          - id: imbalance_strategy
            source_path: parameters.imbalance_strategy
            type: str
          - id: imbalance_max_majority_samples
            source_path: parameters.imbalance_max_majority_samples
            type: int
      - file: output.yaml
        color: "#ffb3b3"
        columns:
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: OW
            source_path: exports.OW
            type: int
          - id: LT
            source_path: exports.LT
            type: int
          - id: PW
            source_path: exports.PW
            type: int
          - id: event_type_count
            source_path: exports.event_type_count 
            type: int 
          - id: prediction_name
            source_path: exports.prediction_name 
            type: str 
          - id: model_family
            source_path: exports.model_family 
            type: str 
          - id: decision_threshold
            source_path: exports.decision_threshold 
            type: float 
          - id: best_val_recall
            source_path: exports.best_val_recall 
            type: float 
          - id: test_precision
            source_path: exports.test_precision 
            type: float 
          - id: test_recall
            source_path: exports.test_recall 
            type: float 
          - id: test_f1
            source_path: exports.test_f1 
            type: float 
          - id: execution_time 
            source_path: metrics.execution_time 
            type: float
          - id: n_train 
            source_path: metrics.n_train 
            type: int
          - id: n_val 
            source_path: metrics.n_val 
            type: int
          - id: n_test 
            source_path: metrics.n_test 
            type: int
          - id: positive_ratio_train 
            source_path: metrics.positive_ratio_train 
            type: float
          - id: tp 
            source_path: metrics.tp 
            type: int
          - id: tn 
            source_path: metrics.tn 
            type: int
          - id: fp 
            source_path: metrics.fp 
            type: int
          - id: fn
            source_path: metrics.fn
            type: int
          - id: generated_at
            source_path: provenance.generated_at
            type: datetime
          - id: params_batch_size
            source_path: mlflow_registration.params.batch_size
            type: int
          - id: params_learning_rate
            source_path: mlflow_registration.params.learning_rate
            type: float
          - id: params_n_layers
            source_path: mlflow_registration.params.n_layers
            type: int
          - id: params_units
            source_path: mlflow_registration.params.units
            type: int
          - id: params_dropout
            source_path: mlflow_registration.params.dropout
            type: float
          - id: params_embed_dim
            source_path: mlflow_registration.params.embed_dim
            type: int
          - id: params_filters
            source_path: mlflow_registration.params.filters
            type: int
          - id: params_kernel_size
            source_path: mlflow_registration.params.kernel_size
            type: int
          - id: params_model_family
            source_path: mlflow_registration.params.model_family
            type: str



  - id: f06_quant     
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parent
            source_path: parent
            type: str
            color: "#fce1fb"
          - id: Tu
            source_path: parameters.Tu
            type: int
          - id: OW
            source_path: parameters.OW
            type: int
          - id: LT
            source_path: parameters.LT
            type: int
          - id: PW
            source_path: parameters.PW
            type: int
          - id: prediction_name
            source_path: parameters.prediction_name
            type: str
          - id: event_type_count
            source_path: parameters.event_type_count
            type: int
          - id: deployment_target
            source_path: parameters.deployment.target
            type: str
          - id: deployment_runtime
            source_path: parameters.deployment.runtime
            type: str
          - id: tflite_optimization
            source_path: parameters.quantization.tflite_optimization
            type: str
          - id: calibration_samples
            source_path: parameters.quantization.calibration_samples
            type: int
          - id: thresholding_strategy
            source_path: parameters.thresholding.strategy
            type: str
          - id: thresholding_maximize_metric
            source_path: parameters.thresholding.maximize_metric
            type: str
          - id: thresholding_grid_points
            source_path: parameters.thresholding.grid_points
            type: int

      - file: output.yaml
        color: "#ffb3b3"
        columns:
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: OW
            source_path: exports.OW
            type: int
          - id: LT
            source_path: exports.LT
            type: int
          - id: PW
            source_path: exports.PW
            type: int
          - id: event_type_count
            source_path: exports.event_type_count
            type: int
          - id: prediction_name
            source_path: exports.prediction_name
            type: str
          - id: runtime_model_name
            source_path: exports.runtime_model_name
            type: str
          - id: model_family
            source_path: exports.model_family
            type: str
          - id: decision_threshold
            source_path: exports.decision_threshold
            type: float
          - id: model_size_bytes
            source_path: exports.model_size_bytes
            type: int
          - id: arena_estimated_bytes
            source_path: exports.arena_estimated_bytes
            type: int
          - id: footprint_estimated_bytes
            source_path: exports.footprint_estimated_bytes
            type: int
          - id: operators
            source_path: exports.operators
            type: list
          - id: input_dtype
            source_path: exports.input_dtype
            type: str
          - id: output_dtype
            source_path: exports.output_dtype
            type: str
          - id: input_shape
            source_path: exports.input_shape
            type: list
          - id: output_shape
            source_path: exports.output_shape
            type: list
          - id: input_bytes
            source_path: exports.input_bytes
            type: list
          - id: output_bytes
            source_path: exports.output_bytes
            type: list
          - id: execution_time
            source_path: metrics.execution_time
            type: float
          - id: tflm_compatible
            source_path: metrics.tflm_compatible
            type: bool
          - id: operators_detected
            source_path: metrics.operators_detected
            type: int
          - id: unsupported_operators
            source_path: metrics.unsupported_operators
            type: int 
          - id: n_calibration_samples
            source_path: metrics.n_calibration_samples
            type: int



  - id: f07_modval  
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parent
            source_path: parent
            type: str
            color: "#fce1fb"
          - id: prediction_name
            source_path: parameters.prediction_name
            type: str
          - id: decision_threshold
            source_path: parameters.decision_threshold
            type: float
          - id: event_type_count
            source_path: parameters.event_type_count
            type: int
          - id: MTI_MS
            source_path: parameters.MTI_MS
            type: int
          - id: platform
            source_path: parameters.platform
            type: str

      - file: output.yaml
        color: "#ffb3b3"
        columns:
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: OW
            source_path: exports.OW
            type: int
          - id: LT
            source_path: exports.LT
            type: int
          - id: PW
            source_path: exports.PW
            type: int
          - id: event_type_count 
            source_path: exports.event_type_count  
            type : int  
          - id: operators 
            source_path: exports.operators  
            type: list
          - id: decision_threshold 
            source_path: exports.decision_threshold  
            type: float
          - id: arena_bytes
            source_path: exports.arena_bytes
            type: int
          - id: model_memory_bytes
            source_path: exports.model_memory_bytes
            type: int
          - id: itmax_ms
            source_path: exports.itmax_ms
            type: float
          - id: ITmax
            source_path: exports.ITmax
            type: int
          - id: MTI_MS
            source_path: exports.MTI_MS
            type: int
          - id: quality_score
            source_path: exports.quality_score
            type: float
          - id: n_inferences
            source_path: exports.n_inferences
            type: int
          - id: ok_rate
            source_path: exports.ok_rate
            type: float
          - id: offload_rate
            source_path: exports.offload_rate
            type: float
          - id: watchdog_rate
            source_path: exports.watchdog_rate
            type: float
          - id: edge_run_completed
            source_path: exports.edge_run_completed
            type: bool
          - id: phase_status_reason
            source_path: exports.phase_status_reason
            type: str



  - id: f08_sysval
    base_columns:
      - id: variant
        color: "#b3ffc3"
        type: str
        indexed: true
    sources: 
      - file: params.yaml
        color: "#bae7f5"
        columns:
          - id: parents
            source_path: parameters.parents
            type: list
            color: "#fce1fb"
          - id: selection_mode
            source_path: parameters.selection_mode
            type: str
          - id: solver_time_limit_sec
            source_path: parameters.solver_time_limit_sec
            type: int
          - id: time_scale_factor
            source_path: parameters.time_scale_factor
            type: float
          - id: MTI_MS
            source_path: parameters.MTI_MS
            type: int
          - id: platform
            source_path: parameters.platform
            type: str
      - file: output.yaml 
        color: "#ffb3b3"
        columns:
          - id: objective
            source_path: exports.objective
            type: str
          - id: solver_status
            source_path: exports.solver_status
            type: str
          - id: Tu
            source_path: exports.Tu
            type: int
          - id: OW
            source_path: exports.OW
            type: int
          - id: LT
            source_path: exports.LT
            type: int
          - id: PW
            source_path: exports.PW
            type: int
          - id: event_type_count
            source_path: exports.event_type_count
            type: int
          - id: total_models_requested
            source_path: exports.total_models_requested
            type: int
          - id: total_models_declared
            source_path: exports.total_models_declared
            type: int
          - id: total_models_selected
            source_path: exports.total_models_selected
            type: int
          - id: total_model_size_bytes
            source_path: exports.total_model_size_bytes
            type: int
          - id: operators_union
            source_path: exports.operators_union
            type: list
```

###
