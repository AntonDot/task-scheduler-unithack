import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Automation, AutomationLog, User
from app.schemas import AutomationCreate, AutomationLogRead, AutomationRead, AutomationUpdate
from app.services import review_scraper_service

router = APIRouter(prefix="/api/v1/automations", tags=["automations"])

# Trigger types that need a webhook_token (external ingress)
EXTERNAL_TRIGGER_TYPES = {"github_event", "webhook_generic", "review_received"}


def _generate_webhook_token() -> str:
    return secrets.token_urlsafe(32)


def _is_external_trigger(config: dict | None) -> bool:
    if not config:
        return False
    trigger = (config.get("trigger") or {}).get("type")
    return trigger in EXTERNAL_TRIGGER_TYPES


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
    """Create a new automation rule.

    For external trigger types we auto-generate a webhook_token so the user can
    immediately copy the URL from the response.
    """
    data = automation_in.model_dump()
    webhook_token = _generate_webhook_token() if _is_external_trigger(data.get("config")) else None

    automation = Automation(
        **data,
        creator_id=user.id,
        webhook_token=webhook_token,
    )
    db.add(automation)
    await db.commit()
    await db.refresh(automation)
    return automation


@router.get("/catalog")
async def get_automation_catalog(_user: User = Depends(get_current_user)):
    """Return a list of automation templates.

    Note: this route is declared BEFORE /{automation_id}/... so 'catalog' doesn't
    get parsed as a UUID.
    """
    return [
        {
            "category": "automations.catalog.categories.tasks",
            "templates": [
                {
                    "name": "automations.catalog.auto_assign.name",
                    "description": "automations.catalog.auto_assign.description",
                    "config": {
                        "trigger": {"type": "task_created", "filters": {}},
                        "conditions": [],
                        "actions": [{"type": "assign_user", "params": {"user_id": None}}],
                    },
                },
                {
                    "name": "automations.catalog.checklist_done.name",
                    "description": "automations.catalog.checklist_done.description",
                    "config": {
                        "trigger": {"type": "checklist_updated", "filters": {}},
                        "conditions": [{"type": "all_checklist_items_done", "params": {}}],
                        "actions": [{"type": "change_status", "params": {"status": "Done"}}],
                    },
                },
            ],
        },
        {
            "category": "automations.catalog.categories.notifications",
            "templates": [
                {
                    "name": "automations.catalog.high_priority_notif.name",
                    "description": "automations.catalog.high_priority_notif.description",
                    "config": {
                        "trigger": {"type": "task_updated", "filters": {"field": "priority"}},
                        "conditions": [
                            {"type": "field_value_equals", "params": {"field": "priority", "value": "High"}}
                        ],
                        "actions": [
                            {"type": "send_notification", "params": {"message": "automations.catalog.high_priority_notif.message"}}
                        ],
                    },
                }
            ],
        },
        {
            "category": "automations.catalog.categories.reviews",
            "templates": [
                {
                    "name": "automations.catalog.negative_review.name",
                    "description": "automations.catalog.negative_review.description",
                    "config": {
                        "trigger": {
                            "type": "review_received",
                            "params": {"source_url": "http://mock-review-board:8002/api/reviews"},
                        },
                        "conditions": [
                            {"type": "numeric_compare", "params": {"field": "review.rating", "op": "lte", "value": 2}}
                        ],
                        "actions": [
                            {
                                "type": "create_task",
                                "params": {
                                    "column_id": None,
                                    "title": "automations.catalog.negative_review.task_title",
                                    "description": "automations.catalog.negative_review.task_description",
                                    "urgency": "URGENT",
                                },
                            }
                        ],
                    },
                },
            ],
        },
        {
            "category": "automations.catalog.categories.github",
            "templates": [
                {
                    "name": "automations.catalog.pr_merged.name",
                    "description": "automations.catalog.pr_merged.description",
                    "config": {
                        "trigger": {"type": "github_event", "params": {}},
                        "conditions": [],
                        "actions": [
                            {
                                "type": "send_notification",
                                "params": {"message": "automations.catalog.pr_merged.message"},
                            }
                        ],
                    },
                },
                {
                    "name": "automations.catalog.issue_opened.name",
                    "description": "automations.catalog.issue_opened.description",
                    "config": {
                        "trigger": {"type": "github_event", "params": {}},
                        "conditions": [],
                        "actions": [
                            {
                                "type": "create_task",
                                "params": {
                                    "column_id": None,
                                    "title": "automations.catalog.issue_opened.task_title",
                                    "description": "automations.catalog.issue_opened.task_description",
                                    "urgency": "MEDIUM",
                                },
                            }
                        ],
                    },
                },
            ],
        },
        {
            "category": "automations.catalog.categories.generic",
            "templates": [
                {
                    "name": "automations.catalog.generic_webhook.name",
                    "description": "automations.catalog.generic_webhook.description",
                    "config": {
                        "trigger": {"type": "webhook_generic", "params": {}},
                        "conditions": [],
                        "actions": [
                            {
                                "type": "create_task",
                                "params": {
                                    "column_id": None,
                                    "title": "{{title}}",
                                    "description": "{{description}}",
                                    "urgency": "MEDIUM",
                                },
                            }
                        ],
                    },
                },
            ],
        },
    ]


@router.post("/run-review-scraper")
async def run_review_scraper(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Trigger one pass of the review scraper.

    Walks all active review_received automations, fetches reviews from each
    configured source URL, dedupes via webhook_deliveries, and publishes
    review_received events to RabbitMQ for new reviews.
    """
    return await review_scraper_service.run_scrape(db)


@router.get("/history", response_model=list[AutomationLogRead])
async def get_project_automation_history(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get execution history for all automations in a project (last 100 entries)."""
    result = await db.execute(
        select(AutomationLog)
        .join(Automation, AutomationLog.automation_id == Automation.id)
        .where(Automation.project_id == project_id)
        .order_by(AutomationLog.ran_at.desc())
        .limit(100)
    )
    return result.scalars().all()


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
    new_config = update_data.get("config", automation.config)
    # If trigger type was changed to/from external, sync webhook_token
    if "config" in update_data:
        will_be_external = _is_external_trigger(new_config)
        if will_be_external and not automation.webhook_token:
            update_data["webhook_token"] = _generate_webhook_token()
        elif not will_be_external and automation.webhook_token:
            update_data["webhook_token"] = None

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


@router.post("/{automation_id}/rotate-token", response_model=AutomationRead)
async def rotate_webhook_token(
    automation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Regenerate the webhook_token. Only valid for automations with external triggers."""
    result = await db.execute(select(Automation).where(Automation.id == automation_id))
    automation = result.scalar_one_or_none()
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")

    if not _is_external_trigger(automation.config):
        raise HTTPException(
            status_code=400,
            detail="Cannot rotate token: automation has no external trigger",
        )

    automation.webhook_token = _generate_webhook_token()
    await db.commit()
    await db.refresh(automation)
    return automation


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
