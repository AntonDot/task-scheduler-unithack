from datetime import datetime

from pydantic import BaseModel, Field


class ProjectRead(BaseModel):
    id: int
    name: str
    slug: str
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectWithRole(ProjectRead):
    role: str


class ProjectCreate(BaseModel):
    name: str = Field(max_length=255)
    slug: str = Field(max_length=100, pattern=r"^[a-z0-9\-]+$")
    color: str = Field(default="#6c63ff", max_length=7)
