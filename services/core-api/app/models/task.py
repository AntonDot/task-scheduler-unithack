from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.task_assignee import task_assignees
from app.models.task_tag import task_tags

if TYPE_CHECKING:
    from app.models.attachment import Attachment
    from app.models.board_column import BoardColumn
    from app.models.comment import Comment
    from app.models.project import Project
    from app.models.tag import Tag
    from app.models.user import User


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    column_id: Mapped[int] = mapped_column(ForeignKey("board_columns.id", ondelete="RESTRICT"), index=True)
    urgency: Mapped[str] = mapped_column(String(10), default="MEDIUM")
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deadline_reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped[Project] = relationship(back_populates="tasks")
    column: Mapped[BoardColumn] = relationship(back_populates="tasks")
    creator: Mapped[User] = relationship(back_populates="created_tasks", foreign_keys=[creator_id])
    assignee: Mapped[User | None] = relationship(back_populates="assigned_tasks", foreign_keys=[assignee_id])
    co_assignees: Mapped[list[User]] = relationship("User", secondary=task_assignees, lazy="select")
    comments: Mapped[list[Comment]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Comment.created_at"
    )
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="Attachment.created_at"
    )
    tags: Mapped[list[Tag]] = relationship(secondary=task_tags, back_populates="tasks", lazy="selectin")

    @property
    def status(self) -> str:
        if not self.column:
            return "TODO"
        # Mapping based on order or name
        if self.column.order == 0:
            return "TODO"  # Or logic to distinguish AI_DRAFT if we had it
        if self.column.order == 1:
            return "IN_PROGRESS"
        if self.column.order == 2:
            return "REVIEW"
        if self.column.order == 3:
            return "DONE"
        return "TODO"
