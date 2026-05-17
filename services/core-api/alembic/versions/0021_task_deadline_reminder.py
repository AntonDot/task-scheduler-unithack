"""Add deadline_reminder_sent to tasks table.

Revision ID: 0021_task_deadline_reminder
Revises: 0020_user_notification_settings
Create Date: 2026-05-17 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021_task_deadline_reminder"
down_revision: str | None = "0020_user_notification_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("deadline_reminder_sent", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("tasks", "deadline_reminder_sent")
