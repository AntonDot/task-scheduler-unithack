from enum import StrEnum


class ProjectRole(StrEnum):
    OWNER = "OWNER"
    ASSIGNEE = "ASSIGNEE"


class Urgency(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"
