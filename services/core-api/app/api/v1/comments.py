from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Comment, Task, User, UserProject
from app.schemas.comment import CommentCreate, CommentRead
from app.services.audit_service import log_action
from app.services.push_service import send_push_to_user
from app.websocket_manager import ws_manager

router = APIRouter(tags=["comments"])


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


@router.get("/api/v1/tasks/{task_id}/comments", response_model=list[CommentRead])
async def list_comments(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_task_access(task_id, current_user, db)
    result = await db.execute(
        select(Comment).where(Comment.task_id == task_id).options(joinedload(Comment.user)).order_by(Comment.created_at)
    )
    return result.scalars().unique().all()


@router.post("/api/v1/tasks/{task_id}/comments", response_model=CommentRead, status_code=201)
async def add_comment(
    task_id: int,
    body: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Reload task with co_assignees so we can notify all of them
    result = await db.execute(select(Task).where(Task.id == task_id).options(selectinload(Task.co_assignees)))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Task not found")

    up_result = await db.execute(
        select(UserProject).where(UserProject.user_id == current_user.id, UserProject.project_id == task.project_id)
    )
    if up_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="No access to project")

    comment = Comment(task_id=task_id, user_id=current_user.id, text=body.text)
    db.add(comment)
    await db.flush()
    await db.refresh(comment, attribute_names=["user"])
    await log_action(db, task_id, current_user.id, "comment_added")
    data = CommentRead.model_validate(comment).model_dump(mode="json")
    await db.commit()
    await ws_manager.broadcast(task.project_id, "comment_added", data)

    # --- Push notifications ---
    notif_body = f"{current_user.full_name}: {body.text[:80]}{'…' if len(body.text) > 80 else ''}"
    recipients: set[int] = set()
    if task.assignee_id and task.assignee_id != current_user.id:
        recipients.add(task.assignee_id)
    for co in task.co_assignees:
        if co.id != current_user.id:
            recipients.add(co.id)
    # Also notify mentioned users (@name in text)
    if "@" in body.text:
        words = body.text.split()
        mention_names = {w.lstrip("@") for w in words if w.startswith("@")}
        if mention_names:
            name_result = await db.execute(select(User).where(User.full_name.in_(list(mention_names))))
            for u in name_result.scalars().all():
                if u.id != current_user.id:
                    recipients.add(u.id)
    for uid in recipients:
        await send_push_to_user(db, uid, "Новый комментарий", notif_body, f"/tasks/{task_id}")

    return data
