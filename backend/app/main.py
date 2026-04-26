import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import init_db
from app.api.routers import executions, lineage, variants
from app.services import lineage_service, repo_sync_service, variants_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    repo_sync_service.register_callback(lineage_service.refresh)
    repo_sync_service.register_callback(variants_service.sync_all)
    sync_task = asyncio.create_task(repo_sync_service.polling_loop())
    dvc_worker = variants_service.start_worker()
    await variants_service.sync_all()
    yield
    sync_task.cancel()
    dvc_worker.cancel()


app = FastAPI(title="MLOps Control Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(executions.router, prefix="/api/executions", tags=["executions"])
app.include_router(lineage.router, prefix="/api/lineage", tags=["lineage"])
app.include_router(variants.router, prefix="/api/variants", tags=["variants"])
