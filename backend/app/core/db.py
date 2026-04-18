import aiosqlite
from app.core.config import settings

DB_PATH = settings.database_url

_CREATE_TABLE = """
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


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(_CREATE_TABLE)
        await db.commit()
