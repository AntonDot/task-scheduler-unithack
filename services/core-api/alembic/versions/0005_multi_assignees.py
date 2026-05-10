"""Add task_assignees join table for multi-assignee support.

Revision ID: 0005_multi_assignees
Revises: 0004_attachments
Create Date: 2026-05-10 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_multi_assignees"
down_revision: str | None = "0004_attachments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT to_regclass('public.task_assignees')"))
    if result.scalar() is None:
        op.create_table(
            "task_assignees",
            sa.Column("task_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("task_id", "user_id"),
        )


def downgrade() -> None:
    op.drop_table("task_assignees")
