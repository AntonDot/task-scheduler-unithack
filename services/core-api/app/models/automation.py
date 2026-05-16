from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.user import User


class Automation(Base):
    __tablename__ = "automations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(1000))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # config stores { trigger: {...}, conditions: [...], actions: [...] }
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    
    stats_runs: Mapped[int] = mapped_column(Integer, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped[Project] = relationship(back_populates="automations")
    creator: Mapped[User | None] = relationship()
    logs: Mapped[list[AutomationLog]] = relationship(back_populates="automation", cascade="all, delete-orphan")


class AutomationLog(Base):
    __tablename__ = "automation_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("automations.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(50)) # success, failure
    
    # details stores execution path, errors, etc.
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    
    ran_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    automation: Mapped[Automation] = relationship(back_populates="logs")
