from enum import StrEnum


class ProjectRole(StrEnum):
    OWNER = "OWNER"
    ASSIGNEE = "ASSIGNEE"


class Urgency(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"
class TaskStatus(StrEnum):
    AI_DRAFT = "AI_DRAFT"
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"
