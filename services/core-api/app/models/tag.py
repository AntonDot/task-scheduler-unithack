from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.task_tag import task_tags


if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.task import Task


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(50))

    project: Mapped[Project] = relationship(back_populates="tags")
    tasks: Mapped[list[Task]] = relationship(
        secondary=task_tags, back_populates="tags"
    )

