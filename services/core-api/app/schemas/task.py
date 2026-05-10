from datetime import datetime

from pydantic import BaseModel, Field

from app.domain import TaskStatus, Urgency
from app.schemas.project import ProjectRead
from app.schemas.user import UserRead


class TaskCreate(BaseModel):
    title: str = Field(max_length=500)
    description: str | None = None
    assignee_id: int | None = None
    co_assignee_ids: list[int] = Field(default_factory=list)
    urgency: Urgency = Urgency.MEDIUM
    deadline: datetime | None = None
    status: TaskStatus = TaskStatus.TODO


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    assignee_id: int | None = None
    co_assignee_ids: list[int] | None = None
    urgency: Urgency | None = None
    deadline: datetime | None = None


class StatusUpdate(BaseModel):
    status: TaskStatus


class TaskRead(BaseModel):
    id: int
    project_id: int
    creator_id: int
    assignee_id: int | None
    title: str
    description: str | None
    status: TaskStatus
    urgency: Urgency
    deadline: datetime | None
    created_at: datetime
    updated_at: datetime
    project: ProjectRead | None = None
    assignee: UserRead | None = None
    co_assignees: list[UserRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
