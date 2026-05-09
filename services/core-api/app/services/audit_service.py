from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    task_id: int,
    user_id: int,
    action: str,
    old_value: str | None = None,
    new_value: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        task_id=task_id,
        user_id=user_id,
        action=action,
        old_value=old_value,
        new_value=new_value,
    )
    db.add(entry)
    await db.flush()
    return entry


async def get_audit_logs(db: AsyncSession, task_id: int) -> list[AuditLog]:
    result = await db.execute(select(AuditLog).where(AuditLog.task_id == task_id).order_by(AuditLog.created_at.asc()))
    return list(result.scalars().all())
