import aiosqlite
from app.core.config import settings

DB_PATH = settings.database_url

_CREATE_EXECUTIONS = """
CREATE TABLE IF NOT EXISTS executions (
    id          TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL DEFAULT '',
    fase        TEXT NOT NULL,
    variant     TEXT NOT NULL,
    parent      TEXT,
    runner      TEXT NOT NULL,
    params      TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    error_code  TEXT,
    gh_run_id   TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    started_at  TEXT
)
"""

_CREATE_VARIANTS = """
CREATE TABLE IF NOT EXISTS execution_variants (
    id                   TEXT PRIMARY KEY,
    pipeline_id          TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_ev_pipeline ON execution_variants (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_ev_phase    ON execution_variants (phase);
CREATE INDEX IF NOT EXISTS idx_ev_variant  ON execution_variants (variant);
"""


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        # Detect if executions table needs schema migration (missing pipeline_id column).
        # User accepted data loss for this one-time migration.
        async with db.execute("PRAGMA table_info(executions)") as cursor:
            cols = {row[1] async for row in cursor}
        if cols and "pipeline_id" not in cols:
            await db.execute("DROP TABLE IF EXISTS executions")

        await db.execute(_CREATE_EXECUTIONS)

        # Migration: add started_at to existing DBs that don't have it yet
        async with db.execute("PRAGMA table_info(executions)") as cursor:
            cols_after = {row[1] async for row in cursor}
        if cols_after and "started_at" not in cols_after:
            await db.execute("ALTER TABLE executions ADD COLUMN started_at TEXT")

        # execution_variants is rebuilt from disk on startup — always recreate cleanly.
        await db.execute("DROP TABLE IF EXISTS execution_variants")
        await db.executescript(_CREATE_VARIANTS)
        await db.commit()
