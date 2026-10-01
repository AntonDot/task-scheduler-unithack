import json
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain import ProjectRole
from app.models import Tag, Task, UserProject
from app.models.user import User
from app.rabbitmq import rabbitmq_manager
from app.schemas import TaskCreate, TaskUpdate
from app.services.audit_service import log_action
from app.services.push_service import send_push_to_user

_TASK_OPTS = [
    selectinload(Task.project),
    selectinload(Task.column),
    selectinload(Task.assignee),
    selectinload(Task.co_assignees),
    selectinload(Task.tags),
]


async def list_tasks(db: AsyncSession, project_id: int, assignee_id: int | None = None) -> list[Task]:
    stmt = select(Task).where(Task.project_id == project_id, Task.is_deleted.is_(False))
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    result = await db.execute(
        stmt.options(*_TASK_OPTS).order_by(Task.deadline.asc().nulls_last(), Task.created_at.desc())
    )
    return list(result.scalars().all())


async def get_task(db: AsyncSession, task_id: int) -> Task | None:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.is_deleted.is_(False)).options(*_TASK_OPTS))
    return result.scalar_one_or_none()


async def _set_co_assignees(db: AsyncSession, task: Task, ids: list[int]) -> None:
    if not ids:
        task.co_assignees = []
        return
    result = await db.execute(select(User).where(User.id.in_(ids)))
    task.co_assignees = list(result.scalars().all())


async def _reload_task(db: AsyncSession, task_id: int) -> Task:
    # populate_existing: the task is already in the session, and without it relationships
    # loaded earlier (e.g. `column`, which `status` is derived from) keep their stale values
    result = await db.execute(
        select(Task)
        .where(Task.id == task_id, Task.is_deleted.is_(False))
        .options(*_TASK_OPTS)
        .execution_options(populate_existing=True)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


async def _set_tags(db: AsyncSession, task: Task, tag_ids: list[int] | None) -> None:
    if not tag_ids:
        task.tags = []
        return
    unique_ids = list(dict.fromkeys(tag_ids))
    result = await db.execute(select(Tag).where(Tag.id.in_(unique_ids), Tag.project_id == task.project_id))
    tags = list(result.scalars().all())
    if len(tags) != len(unique_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more tags are invalid for this project",
        )
    task.tags = tags


async def create_task(db: AsyncSession, project_id: int, creator_id: int, data: TaskCreate) -> Task:
    column_id = data.column_id
    if column_id is None:
        from app.models.board_column import BoardColumn

        # Try to map status to column
        if data.status:
            # Simple mapping: AI_DRAFT or TODO -> Order 0, IN_PROGRESS -> Order 1, etc.
            target_order = 0
            if data.status == "IN_PROGRESS":
                target_order = 1
            elif data.status == "REVIEW":
                target_order = 2
            elif data.status == "DONE":
                target_order = 3

            col_result = await db.execute(
                select(BoardColumn.id)
                .where(BoardColumn.project_id == project_id, BoardColumn.order == target_order)
                .limit(1)
            )
            column_id = col_result.scalar_one_or_none()

        # Fallback to first column if still None
        if column_id is None:
            col_result = await db.execute(
                select(BoardColumn.id).where(BoardColumn.project_id == project_id).order_by(BoardColumn.order).limit(1)
            )
            column_id = col_result.scalar_one_or_none()

        if column_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Project has no columns")

    task = Task(
        project_id=project_id,
        creator_id=creator_id,
        assignee_id=data.assignee_id,
        title=data.title,
        description=data.description,
        column_id=column_id,
        urgency=data.urgency,
        deadline=data.deadline,
    )

    # Fetch and set relationships BEFORE adding to session to avoid lazy load triggers
    if data.co_assignee_ids:
        result = await db.execute(select(User).where(User.id.in_(data.co_assignee_ids)))
        task.co_assignees = list(result.scalars().all())

    if data.tag_ids:
        unique_ids = list(dict.fromkeys(data.tag_ids))
        result = await db.execute(select(Tag).where(Tag.id.in_(unique_ids), Tag.project_id == project_id))
        tags = list(result.scalars().all())
        if len(tags) != len(unique_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="One or more tags are invalid for this project",
            )
        task.tags = tags
    else:
        task.tags = []

    db.add(task)
    await db.flush()

    task = await _reload_task(db, task.id)

    await log_action(db, task.id, creator_id, "created")

    # Publish to RabbitMQ for automations
    await rabbitmq_manager.publish_event(
        "task_created",
        {
            "id": task.id,
            "project_id": project_id,
            "creator_id": creator_id,
            "assignee_id": task.assignee_id,
            "column_id": task.column_id,
            "urgency": task.urgency,
            "title": task.title,
        },
    )

    # Notify new assignee
    if data.assignee_id and data.assignee_id != creator_id:
        await send_push_to_user(db, data.assignee_id, "Новая задача назначена", task.title, notif_type="task_assigned")
    return task


async def update_task(db: AsyncSession, task_id: int, data: TaskUpdate, user_project: UserProject) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.is_deleted.is_(False)).options(*_TASK_OPTS))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    co_ids_in_task = [u.id for u in task.co_assignees]
    is_co = user_project.user_id in co_ids_in_task
    is_assignee = task.assignee_id == user_project.user_id or is_co

    is_creator = task.creator_id == user_project.user_id

    if user_project.role == ProjectRole.ASSIGNEE and not is_assignee and not is_creator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your task")

    update_data = data.model_dump(exclude_unset=True)

    # Assignees cannot reassign
    if user_project.role == ProjectRole.ASSIGNEE:
        for restricted in ["assignee_id", "co_assignee_ids", "urgency", "project_id"]:
            if restricted in update_data:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Cannot update {restricted}")

    if "tag_ids" in update_data and (
        user_project.role != ProjectRole.OWNER and task.creator_id != user_project.user_id and not is_assignee
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only owner, creator or assignee can manage tags"
        )

    co_assignee_ids = update_data.pop("co_assignee_ids", None)
    tag_ids = update_data.pop("tag_ids", None)
    old_tag_ids = [tag.id for tag in task.tags]

    old_values = {field: getattr(task, field) for field in update_data}

    # Check if assignee_id is changing
    assignee_changed = "assignee_id" in update_data and update_data["assignee_id"] != task.assignee_id
    co_assignee_changed = co_assignee_ids is not None

    for field, value in update_data.items():
        setattr(task, field, value)

    if co_assignee_ids is not None:
        await _set_co_assignees(db, task, co_assignee_ids)

    if tag_ids is not None:
        await _set_tags(db, task, tag_ids)

    await db.flush()
    task = await _reload_task(db, task.id)
    new_values = {field: getattr(task, field) for field in update_data}

    if assignee_changed or co_assignee_changed:
        await log_action(
            db,
            task.id,
            user_project.user_id,
            "task_assigned",
            old_value=json.dumps(
                {"assignee_id": old_values.get("assignee_id", getattr(task, "assignee_id", None))}, default=str
            ),
            new_value=json.dumps({"assignee_id": task.assignee_id}, default=str),
        )
        # Push notification to newly assigned user (if different from actor)
        if assignee_changed and task.assignee_id and task.assignee_id != user_project.user_id:
            await send_push_to_user(
                db, task.assignee_id, "Задача назначена вам", task.title, notif_type="task_assigned"
            )
        if co_assignee_changed:
            new_co_ids = set(co_assignee_ids or [])
            old_co_ids = {u.id for u in task.co_assignees if u.id not in new_co_ids}
            for uid in new_co_ids - old_co_ids:
                if uid != user_project.user_id:
                    await send_push_to_user(
                        db, uid, "Вы добавлены как соисполнитель", task.title, notif_type="task_assigned"
                    )

    # Only log 'updated' if there are other fields changed besides assignee_id
    other_fields = {k: v for k, v in new_values.items() if k != "assignee_id"}
    if other_fields:
        await log_action(
            db,
            task.id,
            user_project.user_id,
            "updated",
            old_value=json.dumps({k: v for k, v in old_values.items() if k != "assignee_id"}, default=str),
            new_value=json.dumps(other_fields, default=str),
        )

    # Publish to RabbitMQ for automations
    await rabbitmq_manager.publish_event(
        "task_updated",
        {
            "id": task.id,
            "project_id": task.project_id,
            "user_id": user_project.user_id,
            "changes": {k: getattr(task, k) for k in update_data},
            "old_values": old_values,
        },
    )

    # Publish tag_changed event separately so tag-based automations fire
    if tag_ids is not None:
        new_tag_ids = [tag.id for tag in task.tags]
        added = [tid for tid in new_tag_ids if tid not in set(old_tag_ids)]
        removed = [tid for tid in old_tag_ids if tid not in set(new_tag_ids)]
        if added or removed:
            await rabbitmq_manager.publish_event(
                "tag_changed",
                {
                    "id": task.id,
                    "task_id": task.id,
                    "project_id": task.project_id,
                    "added_tag_ids": added,
                    "removed_tag_ids": removed,
                    "current_tag_ids": new_tag_ids,
                },
            )

    return task


async def change_column(db: AsyncSession, task_id: int, new_column_id: int, user_project: UserProject) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.is_deleted.is_(False)).options(*_TASK_OPTS))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    co_ids_in_task = [u.id for u in task.co_assignees]
    is_co = user_project.user_id in co_ids_in_task
    is_assignee = task.assignee_id == user_project.user_id or is_co

    if user_project.role == ProjectRole.ASSIGNEE and not is_assignee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your task")

    old_column_id = task.column_id
    task.column_id = new_column_id
    await db.flush()
    task = await _reload_task(db, task.id)
    await log_action(
        db,
        task.id,
        user_project.user_id,
        "column_changed",
        old_value=json.dumps({"column_id": old_column_id}),
        new_value=json.dumps({"column_id": new_column_id}),
    )

    # Push notification for status change
    recipients: set[int] = set()
    if task.assignee_id and task.assignee_id != user_project.user_id:
        recipients.add(task.assignee_id)
    for co in task.co_assignees:
        if co.id != user_project.user_id:
            recipients.add(co.id)

    for uid in recipients:
        await send_push_to_user(
            db,
            uid,
            "Статус задачи изменён",
            f"Задача «{task.title}» перемещена в новую колонку",
            f"/tasks/{task.id}",
            notif_type="status_change",
        )

    # Publish to RabbitMQ for automations
    await rabbitmq_manager.publish_event(
        "column_changed",
        {
            "id": task.id,
            "project_id": task.project_id,
            "user_id": user_project.user_id,
            "old_column_id": old_column_id,
            "new_column_id": new_column_id,
        },
    )

    return task


# Legacy functions removed due to missing TaskStatus and status field in Task model


async def delete_task(db: AsyncSession, task_id: int, user_project: UserProject) -> tuple[int, int]:
    task = await get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.project_id != user_project.project_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task not in your project")

    if user_project.role != ProjectRole.OWNER and task.creator_id != user_project.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner or creator can delete tasks")

    project_id = task.project_id
    deleted_task_id = task.id
    await log_action(db, task.id, user_project.user_id, "deleted")
    task.is_deleted = True
    task.deleted_at = datetime.now(UTC)
    await db.flush()
    return project_id, deleted_task_id
