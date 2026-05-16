"""soft delete tasks

Revision ID: 0014_soft_delete_tasks
Revises: 0013_protected_columns
Create Date: 2026-05-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0014_soft_delete_tasks"
down_revision = "0013_protected_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tasks", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "deleted_at")
    op.drop_column("tasks", "is_deleted")
