from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    github_token: str = ""
    github_repo: str = "Tehedor/MLOps_actions_v2"
    database_url: str = "executions.db"
    queue_limit: int = 50

    class Config:
        env_file = ".env"


settings = Settings()
