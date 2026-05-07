from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, verify_service_token
from app.domain import ProjectRole
from app.models import Project, User, UserProject
from app.schemas import ProjectWithRole, TaskCreate, TaskRead, UserRead
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
