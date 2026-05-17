"""Add webhook_token to automations and webhook_deliveries dedupe table.

Revision ID: 0017_automation_webhooks
Revises: 0016_fix_protected_columns
Create Date: 2026-05-16 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0017_automation_webhooks"
down_revision: str | None = "0016_fix_protected_columns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "automations",
        sa.Column("webhook_token", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_automations_webhook_token",
        "automations",
        ["webhook_token"],
        unique=True,
    )

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "automation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("automations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("external_event_id", sa.String(length=255), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "automation_id",
            "external_event_id",
            name="uq_webhook_deliveries_automation_event",
        ),
    )
    op.create_index(
        "ix_webhook_deliveries_automation_id",
        "webhook_deliveries",
        ["automation_id"],
    )
    op.create_index(
        "ix_webhook_deliveries_received_at",
        "webhook_deliveries",
        ["received_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_webhook_deliveries_received_at", table_name="webhook_deliveries")
    op.drop_index("ix_webhook_deliveries_automation_id", table_name="webhook_deliveries")
    op.drop_table("webhook_deliveries")
    op.drop_index("ix_automations_webhook_token", table_name="automations")
    op.drop_column("automations", "webhook_token")
