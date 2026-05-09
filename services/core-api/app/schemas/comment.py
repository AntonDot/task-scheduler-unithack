from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.user import UserRead


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class CommentRead(BaseModel):
    id: int
    task_id: int
    user_id: int
    text: str
    created_at: datetime
    user: UserRead | None = None

    model_config = {"from_attributes": True}
