"""Make audit_logs.task_id nullable and add project_id for taskless notifications.

Revision ID: 0018_nullable_audit_task
Revises: 0017_automation_webhooks
Create Date: 2026-05-16 12:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018_nullable_audit_task"
down_revision: str | None = "0017_automation_webhooks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Make task_id nullable — enables AuditLog entries from webhook/external events
    op.alter_column("audit_logs", "task_id", nullable=True, existing_type=sa.Integer())

    # Add project_id for project-wide notifications (taskless automation events)
    op.add_column(
        "audit_logs",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_audit_logs_project_id", "audit_logs", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_project_id", table_name="audit_logs")
    op.drop_column("audit_logs", "project_id")
    op.alter_column("audit_logs", "task_id", nullable=False, existing_type=sa.Integer())
