from enum import StrEnum


class TaskStatus(StrEnum):
    AI_DRAFT = "AI_DRAFT"
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"


class ProjectRole(StrEnum):
    OWNER = "OWNER"
    ASSIGNEE = "ASSIGNEE"


class Urgency(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


VALID_STATUS_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.AI_DRAFT: {TaskStatus.TODO},
    TaskStatus.TODO: {TaskStatus.IN_PROGRESS},
    TaskStatus.IN_PROGRESS: {TaskStatus.REVIEW, TaskStatus.TODO},
    TaskStatus.REVIEW: {TaskStatus.DONE, TaskStatus.IN_PROGRESS},
    TaskStatus.DONE: {TaskStatus.REVIEW, TaskStatus.IN_PROGRESS, TaskStatus.TODO},
}

ASSIGNEE_ALLOWED_TARGETS = {TaskStatus.IN_PROGRESS, TaskStatus.REVIEW, TaskStatus.TODO, TaskStatus.DONE}
