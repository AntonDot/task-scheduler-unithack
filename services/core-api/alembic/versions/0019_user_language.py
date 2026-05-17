"""Add language preference to users table.

Revision ID: 0019_user_language
Revises: 0018_nullable_audit_task
Create Date: 2026-05-16 12:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019_user_language"
down_revision: str | None = "0018_nullable_audit_task"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("language", sa.String(10), server_default="en", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "language")
