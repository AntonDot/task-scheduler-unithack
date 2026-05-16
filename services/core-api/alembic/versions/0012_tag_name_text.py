"""Widen tag name column to unbounded text.

Revision ID: 0012_tag_name_text
Revises: 0011_add_tags
Create Date: 2026-05-16 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_tag_name_text"
down_revision: str | None = "0011_add_tags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("tags", "name", existing_type=sa.String(length=255), type_=sa.Text(), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("tags", "name", existing_type=sa.Text(), type_=sa.String(length=255), existing_nullable=False)
