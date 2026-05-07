from pydantic import BaseModel, Field


class IncidentPayload(BaseModel):
    event_id: str
    source: str
    text: str
    urgency: str = "HIGH"
    project_slug: str
    external_rating: int | None = None


class DraftTextPayload(BaseModel):
    source: str = Field(pattern=r"^(manager_ui|telegram|email)$")
    text: str = Field(min_length=1)
    project_slug: str


class ParsedTask(BaseModel):
    title: str
    description: str | None = None
    urgency: str = "MEDIUM"
    assignee_email: str | None = None


class WebhookResponse(BaseModel):
    status: str
    task_id: int | None = None
    message: str = ""
