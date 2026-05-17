"""Create attachments table.

Revision ID: 0004_attachments
Revises: 0003_audit_log
Create Date: 2026-05-16 09:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_attachments"
down_revision: str | None = "0003_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT to_regclass('public.attachments')"))
    if result.scalar() is None:
        op.create_table(
            "attachments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("task_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("filename", sa.String(length=500), nullable=False),
            sa.Column("stored_path", sa.String(length=1000), nullable=False),
            sa.Column("content_type", sa.String(length=100), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_attachments_task_id"), "attachments", ["task_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_attachments_task_id"), table_name="attachments")
    op.drop_table("attachments")
