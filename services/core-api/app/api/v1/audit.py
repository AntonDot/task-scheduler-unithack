from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Task, User, UserProject
from app.schemas.audit_log import AuditLogRead
from app.services import audit_service

router = APIRouter(tags=["audit"])


@router.get("/api/v1/tasks/{task_id}/audit", response_model=list[AuditLogRead])
async def get_audit_logs(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")

    result = await db.execute(
        select(UserProject).where(
            UserProject.user_id == current_user.id,
            UserProject.project_id == task.project_id,
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="No access to project")

    logs = await audit_service.get_audit_logs(db, task_id)
    return logs
