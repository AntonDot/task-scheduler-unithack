from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserRead


class AuditLogRead(BaseModel):
    id: int
    task_id: int
    user_id: int
    action: str
    old_value: str | None = None
    new_value: str | None = None
    created_at: datetime
    user: UserRead | None = None

    model_config = {"from_attributes": True}
