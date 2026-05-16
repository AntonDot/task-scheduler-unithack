from datetime import datetime

from pydantic import BaseModel, Field


class BoardColumnBase(BaseModel):
    name: str = Field(max_length=100)
    color: str = Field(max_length=7, default="#9CA3AF")


class BoardColumnCreate(BoardColumnBase):
    order: int | None = None


class BoardColumnUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    color: str | None = Field(default=None, max_length=7)


class BoardColumnReorder(BaseModel):
    column_ids: list[int]


class BoardColumnRead(BoardColumnBase):
    id: int
    project_id: int
    order: int
    is_protected: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
