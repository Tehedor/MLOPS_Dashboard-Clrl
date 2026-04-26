import aiosqlite
from app.core.config import settings

DB_PATH = settings.database_url

_CREATE_EXECUTIONS = """
CREATE TABLE IF NOT EXISTS executions (
    id          TEXT PRIMARY KEY,
    fase        TEXT NOT NULL,
    variant     TEXT NOT NULL,
    parent      TEXT,
    runner      TEXT NOT NULL,
    params      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    error_code  TEXT,
    gh_run_id   TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
)
"""

_CREATE_VARIANTS = """
CREATE TABLE IF NOT EXISTS execution_variants (
    id                   TEXT PRIMARY KEY,
    phase                TEXT NOT NULL,
    variant              TEXT NOT NULL,
    local_status         TEXT NOT NULL DEFAULT 'not_local',
    local_files_present  INTEGER NOT NULL DEFAULT 0,
    local_files_expected INTEGER NOT NULL DEFAULT 0,
    local_size_bytes     INTEGER NOT NULL DEFAULT 0,
    params_json          TEXT,
    outputs_json         TEXT,
    parse_error          TEXT,
    updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ev_phase   ON execution_variants (phase);
CREATE INDEX IF NOT EXISTS idx_ev_variant ON execution_variants (variant);
"""



async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_CREATE_EXECUTIONS)
        await db.executescript(_CREATE_VARIANTS)
        await db.commit()



