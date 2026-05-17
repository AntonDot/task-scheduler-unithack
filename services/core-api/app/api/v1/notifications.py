"""Notifications endpoint — returns recent activity relevant to the current user."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AuditLog, Comment, Task, User, UserProject
from app.models.task_assignee import task_assignees

router = APIRouter(prefix="/api/v1", tags=["notifications"])

_ACTION_LABELS: dict[str, str] = {
    "task_assigned": "Задача назначена",
    "status_changed": "Статус изменён",
    "comment_added": "Новый комментарий",
    "attachment_added": "Файл прикреплён",
    "task_created": "Задача создана",
    "task_approved": "Задача одобрена",
    "automation_triggered": "Автоматизация сработала",
}

_ACTION_TYPES: dict[str, str] = {
    "task_assigned": "task_assigned",
    "status_changed": "status_change",
    "comment_added": "comment",
    "attachment_added": "comment",
    "task_created": "task_assigned",
    "task_approved": "status_change",
    "automation_triggered": "task_assigned",
}


class NotificationItem(BaseModel):
    id: str
    type: str  # matches settings keys: task_assigned / comment / status_change / mention
    title: str
    body: str
    task_id: int | None = None
    task_title: str
    created_at: datetime
    actor_name: str
    action_key: str = "task_assigned"


@router.get("/notifications", response_model=list[NotificationItem])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationItem]:
    since = datetime.now(UTC) - timedelta(days=14)

    # 1. Get all projects where the user is a member
    proj_result = await db.execute(
        select(UserProject.project_id, UserProject.role).where(UserProject.user_id == current_user.id)
    )
    project_memberships = proj_result.all()
    if not project_memberships:
        return []

    project_ids = [r[0] for r in project_memberships]
    # Use string comparison to be safe with DB representation
    owner_project_ids = [r[0] for r in project_memberships if str(r[1]) == "OWNER"]

    # 2. Identify relevant tasks:
    # - Any task in a project where user is OWNER
    # - Tasks where user is assignee or co-assignee

    # Base subquery for tasks where user is co-assignee
    co_assignee_task_ids = select(task_assignees.c.task_id).where(task_assignees.c.user_id == current_user.id)

    criteria = [Task.assignee_id == current_user.id, Task.id.in_(co_assignee_task_ids)]
    if owner_project_ids:
        criteria.append(Task.project_id.in_(owner_project_ids))

    tasks_result = await db.execute(
        select(Task.id).where(
            Task.project_id.in_(project_ids),
            or_(*criteria),
        )
    )
    my_task_ids = {r[0] for r in tasks_result.all()}

    notifications: list[NotificationItem] = []

    if not my_task_ids:
        return []

    # --- Audit log notifications ---
    # For automation_triggered: old_value stores the intended recipient_user_id (or NULL = broadcast).
    # Only show the entry to the designated recipient, or to everyone if no recipient was specified.
    audit_result = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.task_id.in_(my_task_ids),
            or_(AuditLog.user_id != current_user.id, AuditLog.action == "automation_triggered"),
            AuditLog.action.in_(list(_ACTION_LABELS.keys())),
            AuditLog.created_at >= since,
            # Recipient filter: for automation_triggered only show to the intended user
            or_(
                AuditLog.action != "automation_triggered",   # non-automation: no restriction
                AuditLog.old_value.is_(None),                 # automation broadcast (no specific recipient)
                AuditLog.old_value == str(current_user.id),  # automation targeted at this user
            ),
        )
        .options(joinedload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
        .limit(30)
    )
    audit_logs = list(audit_result.scalars().unique().all())

    # Fetch task titles in bulk
    task_ids_needed = {log.task_id for log in audit_logs}
    tasks_map: dict[int, Task] = {}
    if task_ids_needed:
        t_result = await db.execute(select(Task).where(Task.id.in_(task_ids_needed)))
        for t in t_result.scalars().all():
            tasks_map[t.id] = t

    for log in audit_logs:
        task = tasks_map.get(log.task_id)
        task_title = task.title if task else f"Task #{log.task_id}"
        actor = log.user.full_name if log.user else "Кто-то"
        label = _ACTION_LABELS.get(log.action, log.action)
        notif_type = _ACTION_TYPES.get(log.action, "task_assigned")
        body = f"{actor} — {task_title}"
        if log.action == "status_changed" and log.new_value:
            body = f"{actor} изменил(а) статус на «{log.new_value}» — {task_title}"
        elif log.action == "automation_triggered" and log.new_value:
            body = f"{log.new_value} — {task_title}"
        notifications.append(
            NotificationItem(
                id=f"audit-{log.id}",
                type=notif_type,
                title=label,
                body=body,
                task_id=log.task_id,
                task_title=task_title,
                created_at=log.created_at,
                actor_name=actor,
                action_key=log.action,
            )
        )

    # --- Mention notifications (comments containing @current_user.full_name) ---
    mention_result = await db.execute(
        select(Comment)
        .where(
            Comment.task_id.in_(select(Task.id).where(Task.project_id.in_(project_ids))),
            Comment.user_id != current_user.id,
            Comment.text.ilike(f"%@{current_user.full_name}%"),
            Comment.created_at >= since,
        )
        .options(joinedload(Comment.user))
        .order_by(Comment.created_at.desc())
        .limit(10)
    )
    mentions = list(mention_result.scalars().unique().all())
    for c in mentions:
        actor = c.user.full_name if c.user else "Кто-то"
        notifications.append(
            NotificationItem(
                id=f"mention-{c.id}",
                type="mention",
                title="Вас упомянули",
                body=f"{actor}: {c.text[:80]}{'…' if len(c.text) > 80 else ''}",
                task_id=c.task_id,
                task_title=f"Task #{c.task_id}",
                created_at=c.created_at,
                actor_name=actor,
                action_key="mentioned",
            )
        )

    # --- Mention notifications (tasks description containing @current_user.full_name) ---
    task_mention_result = await db.execute(
        select(Task)
        .where(
            Task.project_id.in_(project_ids),
            Task.description.ilike(f"%@{current_user.full_name}%"),
            Task.updated_at >= since,
        )
        .options(joinedload(Task.creator))
        .order_by(Task.updated_at.desc())
        .limit(10)
    )
    task_mentions = list(task_mention_result.scalars().unique().all())
    for t in task_mentions:
        if not t.description:
            continue
        actor = t.creator.full_name if t.creator else "Кто-то"
        notifications.append(
            NotificationItem(
                id=f"mention-task-{t.id}",
                type="mention",
                title="Вас упомянули в описании",
                body=f"{actor}: {t.description[:80]}{'…' if len(t.description) > 80 else ''}",
                task_id=t.id,
                task_title=t.title,
                created_at=t.updated_at,
                actor_name=actor,
                action_key="mentioned_description",
            )
        )

    # --- Taskless automation notifications (webhook/review events, no specific task) ---
    taskless_result = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.task_id.is_(None),
            AuditLog.project_id.in_(project_ids),
            AuditLog.action == "automation_triggered",
            AuditLog.created_at >= since,
            # Same recipient filter as task-bound: NULL = broadcast, otherwise must match
            or_(
                AuditLog.old_value.is_(None),
                AuditLog.old_value == str(current_user.id),
            ),
        )
        .options(joinedload(AuditLog.user))
        .order_by(AuditLog.created_at.desc())
        .limit(10)
    )
    taskless_logs = list(taskless_result.scalars().unique().all())
    for log in taskless_logs:
        actor = log.user.full_name if log.user else "Система"
        notifications.append(
            NotificationItem(
                id=f"audit-{log.id}",
                type="task_assigned",
                title="Автоматизация сработала",
                body=log.new_value or "Automation triggered",
                task_id=None,
                task_title="—",
                created_at=log.created_at,
                actor_name=actor,
                action_key="automation_triggered",
            )
        )

    # Sort combined list and cap
    notifications.sort(key=lambda n: n.created_at, reverse=True)
    return notifications[:25]
