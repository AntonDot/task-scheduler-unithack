"""Add accent_color to users table.

Revision ID: 0006_add_accent_color
Revises: 0005_multi_assignees
Create Date: 2026-05-12 01:28:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_add_accent_color"
down_revision: str | None = "0005_multi_assignees"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Check if column exists before adding
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='accent_color'"
        )
    )
    if result.scalar() is None:
        op.add_column("users", sa.Column("accent_color", sa.String(length=7), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "accent_color")
