"""Compatibility checks for databases created before Alembic migrations."""

from __future__ import annotations

import asyncio

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings

REQUIRED_TABLES = {"users", "projects", "user_projects", "tasks"}


async def _has_legacy_schema() -> bool:
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda sync_conn: set(inspect(sync_conn).get_table_names()))
    await engine.dispose()
    return REQUIRED_TABLES.issubset(tables)


def main() -> int:
    return 0 if asyncio.run(_has_legacy_schema()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
