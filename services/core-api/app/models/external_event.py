from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ExternalEvent(Base):
    """Incoming external events (e.g. scraped reviews) that already produced a task.

    Replaces the in-memory set in ml-worker and the state file of review-scraper:
    deduplication state lives in PostgreSQL, so both processes stay stateless and
    can be restarted or scaled without re-creating tasks.
    """

    __tablename__ = "external_events"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
