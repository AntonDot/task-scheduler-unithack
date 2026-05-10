import json

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain import ASSIGNEE_ALLOWED_TARGETS, VALID_STATUS_TRANSITIONS, ProjectRole, TaskStatus
from app.models import Task, UserProject
from app.models.user import User
from app.schemas import TaskCreate, TaskUpdate
from app.services.audit_service import log_action

_TASK_OPTS = [selectinload(Task.project), selectinload(Task.assignee), selectinload(Task.co_assignees)]


async def list_tasks(db: AsyncSession, project_id: int, assignee_id: int | None = None) -> list[Task]:
    stmt = select(Task).where(Task.project_id == project_id)
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    result = await db.execute(
        stmt.options(*_TASK_OPTS).order_by(Task.deadline.asc().nulls_last(), Task.created_at.desc())
    )
    return list(result.scalars().all())


async def get_task(db: AsyncSession, task_id: int) -> Task | None:
    result = await db.execute(select(Task).where(Task.id == task_id).options(*_TASK_OPTS))
    return result.scalar_one_or_none()


async def _set_co_assignees(db: AsyncSession, task: Task, ids: list[int]) -> None:
    if not ids:
        task.co_assignees = []
        return
    result = await db.execute(select(User).where(User.id.in_(ids)))
    task.co_assignees = list(result.scalars().all())


async def create_task(db: AsyncSession, project_id: int, creator_id: int, data: TaskCreate) -> Task:
    task = Task(
        project_id=project_id,
        creator_id=creator_id,
        assignee_id=data.assignee_id,
        title=data.title,
        description=data.description,
        status=data.status,
        urgency=data.urgency,
        deadline=data.deadline,
    )
    db.add(task)
    await db.flush()
    if data.co_assignee_ids:
        await _set_co_assignees(db, task, data.co_assignee_ids)
    await db.refresh(task)
    await db.refresh(task, attribute_names=["project", "assignee", "co_assignees"])
    await log_action(db, task.id, creator_id, "created")
    return task


async def update_task(db: AsyncSession, task_id: int, data: TaskUpdate, user_project: UserProject) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id).options(*_TASK_OPTS))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    co_ids_in_task = [u.id for u in task.co_assignees]
    is_co = user_project.user_id in co_ids_in_task
    if user_project.role == ProjectRole.ASSIGNEE and task.assignee_id != user_project.user_id and not is_co:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your task")

    update_data = data.model_dump(exclude_unset=True)
    co_assignee_ids = update_data.pop("co_assignee_ids", None)



    old_values = {field: getattr(task, field) for field in update_data}
    for field, value in update_data.items():
        setattr(task, field, value)

    if co_assignee_ids is not None:
        await _set_co_assignees(db, task, co_assignee_ids)

    await db.flush()
    await db.refresh(task)
    await db.refresh(task, attribute_names=["project", "assignee", "co_assignees"])
    new_values = {field: getattr(task, field) for field in update_data}
    await log_action(
        db,
        task.id,
        user_project.user_id,
        "updated",
        old_value=json.dumps(old_values, default=str),
        new_value=json.dumps(new_values, default=str),
    )
    return task


async def change_status(db: AsyncSession, task_id: int, new_status: TaskStatus, user_project: UserProject) -> Task:
    result = await db.execute(
        select(Task).where(Task.id == task_id).options(selectinload(Task.project), selectinload(Task.assignee))
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    current = TaskStatus(task.status)
    allowed = VALID_STATUS_TRANSITIONS.get(current, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition from {current} to {new_status}",
        )

    if user_project.role == ProjectRole.ASSIGNEE:
        if task.assignee_id != user_project.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your task")
        if new_status not in ASSIGNEE_ALLOWED_TARGETS:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assignee cannot set this status")

    old_status = task.status
    task.status = new_status
    await db.flush()
    await db.refresh(task)
    await db.refresh(task, attribute_names=["project", "assignee", "co_assignees"])
    await log_action(
        db,
        task.id,
        user_project.user_id,
        "status_changed",
        old_value=json.dumps({"status": old_status}),
        new_value=json.dumps({"status": str(new_status)}),
    )
    return task


async def approve_draft(db: AsyncSession, task_id: int, user_project: UserProject) -> Task:
    if user_project.role != ProjectRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can approve drafts")

    result = await db.execute(
        select(Task).where(Task.id == task_id).options(selectinload(Task.project), selectinload(Task.assignee))
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    if TaskStatus(task.status) != TaskStatus.AI_DRAFT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only AI_DRAFT tasks can be approved",
        )

    old_status = task.status
    task.status = TaskStatus.TODO
    await db.flush()
    await db.refresh(task)
    await db.refresh(task, attribute_names=["project", "assignee", "co_assignees"])
    await log_action(
        db,
        task.id,
        user_project.user_id,
        "status_changed",
        old_value=json.dumps({"status": old_status}),
        new_value=json.dumps({"status": str(TaskStatus.TODO)}),
    )
    return task


async def discard_draft(db: AsyncSession, task_id: int, user_project: UserProject) -> tuple[int, int]:
    if user_project.role != ProjectRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can discard drafts")

    task = await get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    if TaskStatus(task.status) != TaskStatus.AI_DRAFT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only AI_DRAFT tasks can be discarded",
        )

    project_id = task.project_id
    deleted_task_id = task.id
    await db.delete(task)
    await db.flush()
    return project_id, deleted_task_id


async def delete_task(db: AsyncSession, task_id: int, user_project: UserProject) -> tuple[int, int]:
    if user_project.role != ProjectRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can delete tasks")

    task = await get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    project_id = task.project_id
    deleted_task_id = task.id
    await log_action(db, task.id, user_project.user_id, "deleted")
    await db.delete(task)
    await db.flush()
    return project_id, deleted_task_id
