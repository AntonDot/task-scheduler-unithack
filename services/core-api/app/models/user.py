from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.attachment import Attachment
    from app.models.comment import Comment
    from app.models.task import Task
    from app.models.user_project import UserProject


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    accent_color: Mapped[str | None] = mapped_column(String(7))
    avatar_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project_links: Mapped[list[UserProject]] = relationship(back_populates="user")
    created_tasks: Mapped[list[Task]] = relationship(back_populates="creator", foreign_keys="Task.creator_id")
    assigned_tasks: Mapped[list[Task]] = relationship(back_populates="assignee", foreign_keys="Task.assignee_id")
    comments: Mapped[list[Comment]] = relationship(back_populates="user")
    attachments: Mapped[list[Attachment]] = relationship(back_populates="user")
