from pydantic import BaseModel


class AssigneeLoad(BaseModel):
    user_id: int
    full_name: str
    task_count: int
    in_progress: int


class ProjectAnalytics(BaseModel):
    total_tasks: int
    by_status: dict[str, int]
    by_urgency: dict[str, int]
    overdue_count: int
    avg_completion_hours: float | None
    assignee_load: list[AssigneeLoad]
