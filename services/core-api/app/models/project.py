from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.automation import Automation
    from app.models.board_column import BoardColumn
    from app.models.tag import Tag
    from app.models.task import Task
    from app.models.user_project import UserProject


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    color: Mapped[str] = mapped_column(String(7), default="#6c63ff")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user_links: Mapped[list[UserProject]] = relationship(back_populates="project")
    tasks: Mapped[list[Task]] = relationship(back_populates="project")
    columns: Mapped[list[BoardColumn]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="BoardColumn.order"
    )
    tags: Mapped[list[Tag]] = relationship(back_populates="project", cascade="all, delete-orphan")
    automations: Mapped[list[Automation]] = relationship(back_populates="project", cascade="all, delete-orphan")
