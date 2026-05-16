import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

_EXTERNAL_TRIGGERS = {"review_received", "github_event", "webhook_generic"}
_BOARD_ONLY_CONDITIONS = {"column_equals"}
_BOARD_ONLY_ACTIONS = {"change_column", "assign_user"}


def _check_trigger_compatibility(config: dict[str, Any]) -> None:
    trigger_type = (config.get("trigger") or {}).get("type")
    if trigger_type not in _EXTERNAL_TRIGGERS:
        return
    for cond in config.get("conditions") or []:
        if isinstance(cond, dict) and cond.get("type") in _BOARD_ONLY_CONDITIONS:
            raise ValueError(
                f"Condition '{cond['type']}' requires an internal trigger "
                f"(task_created / task_updated / column_changed), "
                f"but trigger is '{trigger_type}'."
            )
    for act in config.get("actions") or []:
        if isinstance(act, dict) and act.get("type") in _BOARD_ONLY_ACTIONS:
            raise ValueError(
                f"Action '{act['type']}' requires an internal trigger "
                f"(task_created / task_updated / column_changed), "
                f"but trigger is '{trigger_type}'."
            )


class AutomationBase(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True
    config: dict[str, Any]


class AutomationCreate(AutomationBase):
    project_id: int

    @field_validator("config")
    @classmethod
    def validate_config_compat(cls, v: dict[str, Any]) -> dict[str, Any]:
        _check_trigger_compatibility(v)
        return v


class AutomationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    config: dict[str, Any] | None = None

    @field_validator("config")
    @classmethod
    def validate_config_compat(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is not None:
            _check_trigger_compatibility(v)
        return v


class AutomationRead(AutomationBase):
    id: uuid.UUID
    project_id: int
    creator_id: int | None
    stats_runs: int
    webhook_token: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AutomationLogRead(BaseModel):
    id: uuid.UUID
    automation_id: uuid.UUID
    status: str
    details: dict[str, Any]
    ran_at: datetime

    model_config = ConfigDict(from_attributes=True)
