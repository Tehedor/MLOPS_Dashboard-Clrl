from pydantic import BaseModel


class PipelineProject(BaseModel):
    id: str
    label: str
    repo: str
    branch: str
    external_base: str = ""
    # Derived from external_base if not set explicitly
    traceability_path: str = ""
    actions_repo_local_path: str = ""
    actions_repo_path_executions: str = ""
    analisis_files_path: str = ""
    local_pipeline_path: str = ""
    mlflow_tracking_uri: str = ""
    dagshub_repository: str = ""
    color: str = ""
    init_marker: str = ".mlops4ofp"
    command_start: str = "make setup SETUP_CFG=setup/remote2.yaml"
