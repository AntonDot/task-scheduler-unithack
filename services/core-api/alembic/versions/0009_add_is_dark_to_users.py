"""Add is_dark and last_notifications_read_at to users table and set default accent_color to blue.

Revision ID: 0009_add_missing_cols
Revises: 0008_user_avatar_data
Create Date: 2026-05-14 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_fix_users"
down_revision: str | None = "0008_user_avatar_data"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add missing columns if not exist
    conn = op.get_bind()

    # is_dark
    result = conn.execute(sa.text(
        "SELECT column_name "
        "FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='is_dark'"
    ))
    if result.scalar() is None:
        op.add_column("users", sa.Column("is_dark", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    # last_notifications_read_at
    result = conn.execute(sa.text(
        "SELECT column_name "
        "FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='last_notifications_read_at'"
    ))
    if result.scalar() is None:
        op.add_column("users", sa.Column("last_notifications_read_at", sa.DateTime(timezone=True), nullable=True))

    # 2. Update accent_color for all existing users to blue (#3B82F6)
    op.execute("UPDATE users SET accent_color = '#3B82F6' WHERE accent_color IS NULL OR accent_color != '#3B82F6'")


def downgrade() -> None:
    op.drop_column("users", "is_dark")
    op.drop_column("users", "last_notifications_read_at")
