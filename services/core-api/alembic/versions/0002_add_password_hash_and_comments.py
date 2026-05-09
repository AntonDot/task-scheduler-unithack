"""Add password_hash to users and create comments table.

Revision ID: 0002_password_comments
Revises: 0001_initial_schema
Create Date: 2026-05-08 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_password_comments"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add password_hash column to users (idempotent)
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='password_hash'"
        )
    )
    if result.fetchone() is None:
        op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))

    # Create comments table (idempotent)
    result = conn.execute(sa.text("SELECT to_regclass('public.comments')"))
    if result.scalar() is None:
        op.create_table(
            "comments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("task_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_comments_task_id"), "comments", ["task_id"], unique=False)
        op.create_index(op.f("ix_comments_user_id"), "comments", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_comments_user_id"), table_name="comments")
    op.drop_index(op.f("ix_comments_task_id"), table_name="comments")
    op.drop_table("comments")
    op.drop_column("users", "password_hash")
