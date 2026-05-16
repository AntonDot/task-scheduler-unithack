import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AutomationBase(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True
    config: dict[str, Any]


class AutomationCreate(AutomationBase):
    project_id: int


class AutomationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    config: dict[str, Any] | None = None


class AutomationRead(AutomationBase):
    id: uuid.UUID
    project_id: int
    creator_id: int | None
    stats_runs: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutomationLogRead(BaseModel):
    id: uuid.UUID
    automation_id: uuid.UUID
    status: str
    details: dict[str, Any]
    ran_at: datetime

    model_config = ConfigDict(from_attributes=True)
