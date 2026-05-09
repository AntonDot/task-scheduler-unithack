from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserRead


class AttachmentRead(BaseModel):
    id: int
    task_id: int
    user_id: int
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime
    user: UserRead | None = None

    model_config = {"from_attributes": True}
