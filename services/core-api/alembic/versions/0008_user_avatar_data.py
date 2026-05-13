"""Add avatar_data to users table.

Revision ID: 0008_user_avatar_data
Revises: 0007_push_subscriptions
Create Date: 2026-05-13 01:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_user_avatar_data"
down_revision: str | None = "0007_push_subscriptions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='avatar_data'"
    ))
    if result.scalar() is None:
        op.add_column("users", sa.Column("avatar_data", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_data")
