import csv
import io
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_project_access, verify_service_token
from app.domain import ProjectRole
from app.models import BoardColumn, Project, Tag, Task, User, UserProject
from app.schemas import ProjectMemberRead, ProjectWithRole, TagCreate, TagRead, TaskCreate, TaskRead, UserRead
from app.schemas.analytics import AssigneeLoad, ProjectAnalytics
from app.services import task_service
from app.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1", tags=["projects"])


@router.get("/projects", response_model=list[ProjectWithRole])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project, UserProject.role)
        .join(UserProject, UserProject.project_id == Project.id)
        .where(UserProject.user_id == current_user.id)
    )
    rows = result.all()
    return [
        ProjectWithRole(
            id=project.id,
            name=project.name,
            slug=project.slug,
            color=project.color,
            created_at=project.created_at,
            role=role,
        )
        for project, role in rows
    ]


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/projects/{project_id}/members", response_model=list[ProjectMemberRead])
async def list_project_members(
    project_id: int,
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User, UserProject.role)
        .join(UserProject, UserProject.user_id == User.id)
        .where(UserProject.project_id == project_id)
    )
    return [
        ProjectMemberRead(id=user.id, full_name=user.full_name, email=user.email, role=role)
        for user, role in result.all()
    ]


@router.post(
    "/projects/by-slug/{project_slug}/tasks",
    response_model=TaskRead,
    status_code=201,
    dependencies=[Depends(verify_service_token)],
)
async def create_task_by_project_slug(
    project_slug: str,
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
):
    project_result = await db.execute(select(Project).where(Project.slug == project_slug))
    project = project_result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Project not found")

    owner_result = await db.execute(
        select(UserProject).where(UserProject.project_id == project.id, UserProject.role == ProjectRole.OWNER)
    )
    owner_link = owner_result.scalar_one_or_none()

    if owner_link is None:
        fallback_result = await db.execute(select(UserProject).where(UserProject.project_id == project.id))
        owner_link = fallback_result.scalar_one_or_none()

    if owner_link is None:
        raise HTTPException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Project has no members")

    task = await task_service.create_task(db, project.id, owner_link.user_id, body)
    data = TaskRead.model_validate(task).model_dump(mode="json")
    await db.commit()
    await ws_manager.broadcast(project.id, "task_created", data)
    return data


@router.get("/projects/{project_id}/analytics", response_model=ProjectAnalytics)
async def get_project_analytics(
    project_id: int,
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    # Total tasks
    total_result = await db.execute(
        select(func.count(Task.id)).where(Task.project_id == project_id, Task.is_deleted.is_(False))
    )
    total_tasks = total_result.scalar() or 0

    # Get all columns for the project ordered by order
    col_result = await db.execute(
        select(BoardColumn).where(BoardColumn.project_id == project_id).order_by(BoardColumn.order)
    )
    columns = col_result.scalars().all()
    first_col_id = columns[0].id if columns else -1
    last_col_id = columns[-1].id if columns else -1

    # By status (column name)
    status_result = await db.execute(
        select(BoardColumn.name, func.count(Task.id).filter(Task.is_deleted.is_(False)))
        .join(Task, Task.column_id == BoardColumn.id, isouter=True)
        .where(BoardColumn.project_id == project_id)
        .group_by(BoardColumn.id)
    )
    by_status = dict(status_result.all())

    # By urgency
    urgency_result = await db.execute(
        select(Task.urgency, func.count(Task.id))
        .where(Task.project_id == project_id, Task.is_deleted.is_(False))
        .group_by(Task.urgency)
    )
    by_urgency = dict(urgency_result.all())

    # Overdue count: tasks with deadline in the past and not in the last column
    now = datetime.now(UTC)
    overdue_result = await db.execute(
        select(func.count(Task.id)).where(
            Task.project_id == project_id,
            Task.deadline < now,
            Task.column_id != last_col_id,
            Task.deadline.isnot(None),
            Task.is_deleted.is_(False),
        )
    )
    overdue_count = overdue_result.scalar() or 0

    # Average completion hours (for tasks in the last column that have created_at and updated_at)
    done_result = await db.execute(
        select(Task.created_at, Task.updated_at).where(
            Task.project_id == project_id,
            Task.column_id == last_col_id,
            Task.is_deleted.is_(False),
        )
    )
    done_rows = done_result.all()
    avg_completion_hours = None
    if done_rows:
        total_hours = 0.0
        count = 0
        for created_at, updated_at in done_rows:
            if created_at and updated_at:
                delta = (updated_at - created_at).total_seconds() / 3600
                total_hours += delta
                count += 1
        if count > 0:
            avg_completion_hours = round(total_hours / count, 1)

    # Assignee load
    assignee_result = await db.execute(
        select(
            Task.assignee_id,
            User.full_name,
            func.count(Task.id).label("task_count"),
            func.sum(case((Task.column_id.notin_([first_col_id, last_col_id]), 1), else_=0)).label("in_progress"),
        )
        .join(User, User.id == Task.assignee_id)
        .where(Task.project_id == project_id, Task.assignee_id.isnot(None), Task.is_deleted.is_(False))
        .group_by(Task.assignee_id, User.full_name)
    )
    assignee_load = [
        AssigneeLoad(
            user_id=row.assignee_id,
            full_name=row.full_name,
            task_count=row.task_count,
            in_progress=row.in_progress,
        )
        for row in assignee_result.all()
    ]

    return ProjectAnalytics(
        total_tasks=total_tasks,
        by_status=by_status,
        by_urgency=by_urgency,
        overdue_count=overdue_count,
        avg_completion_hours=avg_completion_hours,
        assignee_load=assignee_load,
    )


@router.get("/projects/{project_id}/export")
async def export_project_tasks(
    project_id: int,
    export_format: str = Query("csv", alias="format"),
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    if export_format != "csv":
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Only CSV format is supported")

    result = await db.execute(
        select(Task)
        .where(Task.project_id == project_id, Task.is_deleted.is_(False))
        .options(selectinload(Task.assignee), selectinload(Task.column))
        .order_by(Task.id)
    )
    tasks = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "title", "status", "urgency", "assignee", "deadline", "created_at", "updated_at"])
    for t in tasks:
        assignee_name = t.assignee.full_name if t.assignee else ""
        writer.writerow(
            [
                t.id,
                t.title,
                t.column.name if t.column else "",
                t.urgency,
                assignee_name,
                str(t.deadline) if t.deadline else "",
                str(t.created_at) if t.created_at else "",
                str(t.updated_at) if t.updated_at else "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=project_{project_id}_tasks.csv"},
    )


@router.get("/projects/{project_id}/tags", response_model=list[TagRead])
async def list_project_tags(
    project_id: int,
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tag).where(Tag.project_id == project_id))
    return list(result.scalars().all())


@router.post("/projects/{project_id}/tags", response_model=TagRead, status_code=201)
async def create_project_tag(
    project_id: int,
    body: TagCreate,
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    if _access.role != ProjectRole.OWNER:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Only owner can manage tags")
    tag = Tag(project_id=project_id, name=body.name, color=body.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(
    tag_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # First get the tag and its project to verify access
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Tag not found")

    # Verify access to the project
    access_result = await db.execute(
        select(UserProject).where(
            UserProject.user_id == current_user.id,
            UserProject.project_id == tag.project_id,
        )
    )
    access = access_result.scalar_one_or_none()
    if not access:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="No access to project")

    if access.role != ProjectRole.OWNER:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Only owner can manage tags")

    await db.delete(tag)
    await db.commit()
