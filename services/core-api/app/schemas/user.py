from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserRead(BaseModel):
    id: int
    full_name: str
    email: str
    is_active: bool
    created_at: datetime
    accent_color: str | None = None
    is_dark: bool = False
    language: str = "en"
    last_notifications_read_at: datetime | None = None
    avatar_data: str | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr


class ProjectMemberRead(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    avatar_data: str | None = None

    model_config = {"from_attributes": True}
