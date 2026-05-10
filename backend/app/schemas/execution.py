from enum import Enum
from typing import Any
from pydantic import BaseModel


class ExecutionStatus(str, Enum):
    queued = "queued"
    waiting_parent = "waiting_parent"
    waiting_runner = "waiting_runner"
    dispatching = "dispatching"
    running = "running"
    success = "success"
    failed = "failed"
    canceled = "canceled"


class ExecutionCreate(BaseModel):
    fase: str
    variant: str
    parent: str | None = None
    params: dict[str, Any] = {}
    selected_runner: str | None = None


class Execution(BaseModel):
    id: str
    fase: str
    variant: str
    parent: str | None
    runner: str
    params: dict[str, Any]
    status: ExecutionStatus
    error_code: str | None = None
    gh_run_id: str | None = None
    created_at: str
    updated_at: str
