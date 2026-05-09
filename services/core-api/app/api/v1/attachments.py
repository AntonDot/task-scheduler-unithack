import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi import status as http_status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Attachment, Task, User, UserProject
from app.schemas.attachment import AttachmentRead
from app.services.audit_service import log_action
from app.websocket_manager import ws_manager

router = APIRouter(tags=["attachments"])

UPLOAD_DIR = "/app/uploads"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_TYPE_PREFIXES = (
    "image/",
    "text/",
)
ALLOWED_TYPES_EXACT = {
    "application/pdf",
    "application/msword",
}
ALLOWED_TYPE_PREFIXES_EXTENDED = ("application/vnd.openxmlformats-officedocument.",)


def _is_allowed_content_type(content_type: str) -> bool:
    if any(content_type.startswith(prefix) for prefix in ALLOWED_TYPE_PREFIXES):
        return True
    if content_type in ALLOWED_TYPES_EXACT:
        return True
    if any(content_type.startswith(prefix) for prefix in ALLOWED_TYPE_PREFIXES_EXTENDED):
        return True
    return False


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


@router.post("/api/v1/tasks/{task_id}/attachments", response_model=AttachmentRead, status_code=201)
async def upload_attachment(
    task_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task, _ = await _get_task_access(task_id, current_user, db)

    # Validate content type
    content_type = file.content_type or "application/octet-stream"
    if not _is_allowed_content_type(content_type):
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type not allowed: {content_type}",
        )

    # Read file content and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 10MB.",
        )

    # Store file on disk
    original_filename = file.filename or "untitled"
    unique_name = f"{uuid.uuid4()}_{original_filename}"
    task_dir = Path(UPLOAD_DIR) / str(task_id)
    task_dir.mkdir(parents=True, exist_ok=True)
    stored_path = str(task_dir / unique_name)

    with open(stored_path, "wb") as f:
        f.write(content)

    # Create DB record
    attachment = Attachment(
        task_id=task_id,
        user_id=current_user.id,
        filename=original_filename,
        stored_path=stored_path,
        content_type=content_type,
        size_bytes=len(content),
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment, attribute_names=["user"])

    await log_action(db, task_id, current_user.id, "attachment_added", new_value=original_filename)

    data = AttachmentRead.model_validate(attachment).model_dump(mode="json")
    await db.commit()

    await ws_manager.broadcast(task.project_id, "attachment_added", data)
    return data


@router.get("/api/v1/tasks/{task_id}/attachments", response_model=list[AttachmentRead])
async def list_attachments(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_task_access(task_id, current_user, db)
    result = await db.execute(
        select(Attachment)
        .where(Attachment.task_id == task_id)
        .options(joinedload(Attachment.user))
        .order_by(Attachment.created_at)
    )
    return result.scalars().unique().all()


@router.get("/api/v1/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    # Check project access via task
    result = await db.execute(select(Task).where(Task.id == attachment.task_id))
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

    if not os.path.exists(attachment.stored_path):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    return FileResponse(
        path=attachment.stored_path,
        filename=attachment.filename,
        media_type=attachment.content_type,
    )


@router.delete("/api/v1/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    # Check project access via task
    result = await db.execute(select(Task).where(Task.id == attachment.task_id))
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

    # Only OWNER role can delete
    if link.role != "OWNER":
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Only project owners can delete attachments")

    # Remove file from disk
    if os.path.exists(attachment.stored_path):
        os.remove(attachment.stored_path)

    await db.delete(attachment)
    await db.commit()
