"""Add is_protected flag to board_columns and protect existing default columns.

Revision ID: 0013_protected_columns
Revises: 0012_tag_name_text
Create Date: 2026-05-16 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_protected_columns"
down_revision: str | None = "0012_tag_name_text"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "board_columns",
        sa.Column("is_protected", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Mark all currently existing columns as protected — they are all
    # default columns seeded by the initial migrations. Columns created
    # by users going forward will have is_protected=False by default.
    op.execute("UPDATE board_columns SET is_protected = TRUE")


def downgrade() -> None:
    op.execute("UPDATE board_columns SET is_protected = FALSE")
    op.drop_column("board_columns", "is_protected")
