from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
