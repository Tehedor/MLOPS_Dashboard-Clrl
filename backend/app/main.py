import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import init_db
from app.api.routers import config, executions, lineage, variants, services, pipeline_projects
from app.api.routers.terminal import rest_router as runners_router, ws_router as terminal_ws_router
from app.services import lineage_service, lineage_registry_service, repo_sync_service, supabase_sync_service, variants_service
from app.services.execution_service import ExecutionService, start_gh_poll


async def _sync_lineage_registry(pipeline_id: str) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lineage_registry_service.sync, pipeline_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await ExecutionService().reconcile_stale()

    # Callbacks receive pipeline_id when a project repo is updated
    repo_sync_service.register_callback(lineage_service.refresh)
    repo_sync_service.register_callback(_sync_lineage_registry)
    repo_sync_service.register_callback(variants_service.sync_all)

    sync_task = asyncio.create_task(repo_sync_service.polling_loop())
    realtime_task = asyncio.create_task(
        supabase_sync_service.listen_workflow_runs(repo_sync_service.force_pull)
    )
    poll_task = start_gh_poll()
    dvc_worker = variants_service.start_worker()

    await variants_service.sync_all()
    yield

    sync_task.cancel()
    realtime_task.cancel()
    poll_task.cancel()
    dvc_worker.cancel()


app = FastAPI(title="MLOps Control Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pipeline_projects.router, prefix="/api/pipeline-projects", tags=["pipeline-projects"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(executions.router, prefix="/api/executions", tags=["executions"])
app.include_router(lineage.router, prefix="/api/lineage", tags=["lineage"])
app.include_router(variants.router, prefix="/api/variants", tags=["variants"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(runners_router, prefix="/api/runners", tags=["runners"])
app.include_router(terminal_ws_router, prefix="/ws/terminal", tags=["terminal"])
