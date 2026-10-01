"""Move process state into backing services.

- attachments.stored_path (path on the core-api local disk) → attachments.storage_key
  (key in S3-compatible object storage);
- external_events: dedupe table for incoming external events, replaces the
  in-memory set of ml-worker and the state file of review-scraper.

Revision ID: 0022_stateless_processes
Revises: 0021_task_deadline_reminder
Create Date: 2026-10-01 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_stateless_processes"
down_revision: str | None = "0021_task_deadline_reminder"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("attachments", "stored_path", new_column_name="storage_key")
    op.create_table(
        "external_events",
        sa.Column("event_id", sa.String(255), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("external_events")
    op.alter_column("attachments", "storage_key", new_column_name="stored_path")
