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
}

_ACTION_TYPES: dict[str, str] = {
    "task_assigned": "task_assigned",
    "status_changed": "status_change",
    "comment_added": "comment",
    "attachment_added": "comment",
    "task_created": "task_assigned",
    "task_approved": "status_change",
}


class NotificationItem(BaseModel):
    id: str
    type: str  # matches settings keys: task_assigned / comment / status_change / mention
    title: str
    body: str
    task_id: int
    task_title: str
    created_at: datetime
    actor_name: str


@router.get("/notifications", response_model=list[NotificationItem])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationItem]:
    since = datetime.now(UTC) - timedelta(days=14)

    # Projects the user belongs to
    proj_result = await db.execute(select(UserProject.project_id).where(UserProject.user_id == current_user.id))
    project_ids = [r[0] for r in proj_result.all()]
    if not project_ids:
        return []

    # Tasks where current user is assignee or co-assignee
    tasks_result = await db.execute(
        select(Task.id).where(
            Task.project_id.in_(project_ids),
            or_(
                Task.assignee_id == current_user.id,
                Task.id.in_(select(task_assignees.c.task_id).where(task_assignees.c.user_id == current_user.id)),
            ),
        )
    )
    my_task_ids = {r[0] for r in tasks_result.all()}

    notifications: list[NotificationItem] = []

    # --- Audit log notifications ---
    audit_result = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.task_id.in_(my_task_ids),
            AuditLog.user_id != current_user.id,
            AuditLog.action.in_(list(_ACTION_LABELS.keys())),
            AuditLog.created_at >= since,
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
            )
        )

    # --- Mention notifications (comments containing @current_user.full_name) ---
    mention_result = await db.execute(
        select(Comment)
        .where(
            Comment.task_id.in_(my_task_ids),
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
            )
        )

    # Sort combined list and cap
    notifications.sort(key=lambda n: n.created_at, reverse=True)
    return notifications[:25]
