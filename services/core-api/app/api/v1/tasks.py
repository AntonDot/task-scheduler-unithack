from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi import status as http_status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_project_access
from app.models import Task, User, UserProject
from app.schemas import ColumnUpdate, TaskCreate, TaskRead, TaskUpdate
from app.services import task_service
from app.websocket_manager import ws_manager

router = APIRouter(tags=["tasks"])


async def _get_task_access(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[Task, UserProject]:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.is_deleted == False))
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
    return task, link


@router.get("/api/v1/projects/{project_id}/tasks", response_model=list[TaskRead])
async def list_tasks(
    project_id: int,
    assignee_id: int | None = None,
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    return await task_service.list_tasks(db, project_id, assignee_id=assignee_id)


@router.get("/api/v1/tasks/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task, _ = await _get_task_access(task_id, current_user, db)
    full_task = await task_service.get_task(db, task.id)
    if full_task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")
    return TaskRead.model_validate(full_task).model_dump(mode="json")


@router.post("/api/v1/projects/{project_id}/tasks", response_model=TaskRead, status_code=201)
async def create_task(
    project_id: int,
    body: TaskCreate,
    current_user: User = Depends(get_current_user),
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.create_task(db, project_id, current_user.id, body)
    data = TaskRead.model_validate(task).model_dump(mode="json")
    await db.commit()
    await ws_manager.broadcast(project_id, "task_created", data)
    return data


@router.patch("/api/v1/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    body: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, access = await _get_task_access(task_id, current_user, db)
    task = await task_service.update_task(db, task_id, body, access)
    data = TaskRead.model_validate(task).model_dump(mode="json")
    await db.commit()
    await ws_manager.broadcast(task.project_id, "task_updated", data)
    return data


@router.patch("/api/v1/tasks/{task_id}/column", response_model=TaskRead)
async def change_column(
    task_id: int,
    body: ColumnUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, access = await _get_task_access(task_id, current_user, db)
    task = await task_service.change_column(db, task_id, body.column_id, access)
    data = TaskRead.model_validate(task).model_dump(mode="json")
    await db.commit()
    await ws_manager.broadcast(task.project_id, "task_column_changed", data)
    return data


@router.delete("/api/v1/tasks/{task_id}", status_code=204)
async def delete_task_endpoint(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, access = await _get_task_access(task_id, current_user, db)
    project_id, deleted_task_id = await task_service.delete_task(db, task_id, access)
    await db.commit()
    await ws_manager.broadcast(project_id, "task_deleted", {"task_id": deleted_task_id})


class InternalAutomationUpdate(BaseModel):
    task_id: int
    action: str  # task_updated, column_changed, notification
    message: str | None = None


@router.post("/api/v1/tasks/internal/automation-event", status_code=204)
async def internal_automation_event(
    body: InternalAutomationUpdate,
    x_service_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Internal endpoint for automation worker to trigger WS and Audit Logs."""
    if not settings.service_token or x_service_token != settings.service_token:
        raise HTTPException(status_code=403, detail="Invalid service token")

    # Fetch fresh task data
    task = await task_service.get_task(db, body.task_id)
    if not task:
        return

    # Log to Audit Log for notification bell
    from app.models import AuditLog, User

    # Use the dedicated system user — create if not yet seeded
    res = await db.execute(select(User.id).where(User.email == "system@victory.local"))
    system_user_id = res.scalar()
    if not system_user_id:
        system_user = User(full_name="System", email="system@victory.local")
        db.add(system_user)
        await db.flush()
        system_user_id = system_user.id

    db.add(AuditLog(
        task_id=task.id,
        action="automation_triggered",
        new_value=body.message or f"Automation: {body.action}",
        user_id=system_user_id,
    ))
    await db.commit()

    # Broadcast real-time update AFTER commit to avoid race conditions
    from app.schemas import TaskRead
    data = TaskRead.model_validate(task).model_dump(mode="json")
    ws_event = "task_updated"
    if body.action == "column_changed":
        ws_event = "task_column_changed"

    await ws_manager.broadcast(task.project_id, ws_event, data)

