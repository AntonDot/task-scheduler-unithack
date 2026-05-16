from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.automation import Automation


class WebhookDelivery(Base):
    """Dedupe table for incoming webhook events and scraper-published reviews.

    Uniqueness on (automation_id, external_event_id) prevents the same external
    event from triggering an automation twice — survives restarts unlike in-memory
    sets.
    """

    __tablename__ = "webhook_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("automations.id", ondelete="CASCADE"),
        index=True,
    )
    external_event_id: Mapped[str] = mapped_column(String(255))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    automation: Mapped[Automation] = relationship()

    __table_args__ = (
        UniqueConstraint("automation_id", "external_event_id", name="uq_webhook_deliveries_automation_event"),
    )
