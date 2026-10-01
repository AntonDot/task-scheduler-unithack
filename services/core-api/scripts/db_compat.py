"""Compatibility checks for databases created before Alembic migrations."""

from __future__ import annotations

import asyncio

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings

REQUIRED_TABLES = {"users", "projects", "user_projects", "tasks"}


async def _has_legacy_schema() -> bool:
    """A database created by `create_all` before Alembic: app tables exist, alembic_version does not.

    A database that Alembic already manages is never "legacy": a failed migration there is a
    real error and must stop the release, not be papered over with `alembic stamp head`.
    """
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda sync_conn: set(inspect(sync_conn).get_table_names()))
    await engine.dispose()
    return REQUIRED_TABLES.issubset(tables) and "alembic_version" not in tables


def main() -> int:
    return 0 if asyncio.run(_has_legacy_schema()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
