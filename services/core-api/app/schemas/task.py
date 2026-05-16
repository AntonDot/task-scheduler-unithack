from datetime import datetime

from pydantic import BaseModel, Field

from app.domain import Urgency
from app.schemas.project import ProjectRead
from app.schemas.tag import TagRead
from app.schemas.user import UserRead


class TaskCreate(BaseModel):
    title: str = Field(max_length=500)
    description: str | None = None
    assignee_id: int | None = None
    co_assignee_ids: list[int] = Field(default_factory=list)
    urgency: Urgency = Urgency.MEDIUM
    deadline: datetime | None = None
    column_id: int | None = None
    tag_ids: list[int] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    assignee_id: int | None = None
    co_assignee_ids: list[int] | None = None
    urgency: Urgency | None = None
    deadline: datetime | None = None
    tag_ids: list[int] | None = None


class ColumnUpdate(BaseModel):
    column_id: int


class TaskRead(BaseModel):
    id: int
    project_id: int
    creator_id: int
    assignee_id: int | None
    title: str
    description: str | None
    column_id: int
    urgency: Urgency
    deadline: datetime | None
    created_at: datetime
    updated_at: datetime
    project: ProjectRead | None = None
    assignee: UserRead | None = None
    co_assignees: list[UserRead] = Field(default_factory=list)
    tags: list[TagRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
