import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Automation, AutomationLog, User
from app.schemas import AutomationCreate, AutomationLogRead, AutomationRead, AutomationUpdate

router = APIRouter(prefix="/api/v1/automations", tags=["automations"])


@router.get("", response_model=list[AutomationRead])
async def list_automations(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """List all automations for a project."""
    result = await db.execute(
        select(Automation).where(Automation.project_id == project_id).order_by(Automation.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=AutomationRead, status_code=status.HTTP_201_CREATED)
async def create_automation(
    automation_in: AutomationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new automation rule."""
    automation = Automation(
        **automation_in.model_dump(),
        creator_id=user.id,
    )
    db.add(automation)
    await db.commit()
    await db.refresh(automation)
    return automation


@router.put("/{automation_id}", response_model=AutomationRead)
async def update_automation(
    automation_id: uuid.UUID,
    automation_in: AutomationUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Update an automation rule."""
    result = await db.execute(select(Automation).where(Automation.id == automation_id))
    automation = result.scalar_one_or_none()
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")

    update_data = automation_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(automation, field, value)

    await db.commit()
    await db.refresh(automation)
    return automation


@router.delete("/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_automation(
    automation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Delete an automation rule."""
    result = await db.execute(select(Automation).where(Automation.id == automation_id))
    automation = result.scalar_one_or_none()
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")

    await db.delete(automation)
    await db.commit()


@router.get("/{automation_id}/history", response_model=list[AutomationLogRead])
async def get_automation_history(
    automation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get execution history for an automation."""
    result = await db.execute(
        select(AutomationLog)
        .where(AutomationLog.automation_id == automation_id)
        .order_by(AutomationLog.ran_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.get("/catalog")
async def get_automation_catalog(_user: User = Depends(get_current_user)):
    """Return a list of automation templates."""
    return [
        {
            "category": "Tasks",
            "templates": [
                {
                    "name": "Auto-assign on creation",
                    "description": "Automatically assign a user when a task is created in a specific column.",
                    "config": {
                        "trigger": {"type": "task_created", "filters": {}},
                        "conditions": [],
                        "actions": [{"type": "assign_user", "params": {"user_id": None}}],
                    },
                },
                {
                    "name": "Move to Done when checklist is complete",
                    "description": "Move task to 'Done' status once all checklist items are checked.",
                    "config": {
                        "trigger": {"type": "checklist_updated", "filters": {}},
                        "conditions": [{"type": "all_checklist_items_done", "params": {}}],
                        "actions": [{"type": "change_status", "params": {"status": "Done"}}],
                    },
                },
            ],
        },
        {
            "category": "Notifications",
            "templates": [
                {
                    "name": "Notify on high priority",
                    "description": "Send a notification when a task priority is set to 'High'.",
                    "config": {
                        "trigger": {"type": "task_updated", "filters": {"field": "priority"}},
                        "conditions": [{"type": "field_value_equals", "params": {"field": "priority", "value": "High"}}],
                        "actions": [{"type": "send_notification", "params": {"message": "High priority task detected!"}}],
                    },
                }
            ],
        },
    ]
