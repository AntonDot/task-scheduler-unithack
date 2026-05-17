import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from fastapi import status as http_status
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
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
    "audio/",
    "video/",
)
ALLOWED_TYPES_EXACT = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    "application/x-tar",
    "application/x-gzip",
    "application/x-sql",
    "application/sql",
    "application/json",
    "application/xml",
    "application/x-apple-diskimage",  # .dmg
}
ALLOWED_EXTENSIONS = {
    ".md", ".markdown", ".sql", ".json", ".yaml", ".yml",
    ".log", ".csv", ".dmg", ".zip", ".7z", ".rar", ".gz", ".tar"
}


def _is_allowed_content_type(filename: str, content_type: str) -> bool:
    # Check by prefix (images, text, audio, video)
    if any(content_type.startswith(prefix) for prefix in ALLOWED_TYPE_PREFIXES):
        return True
    # Check exact MIME type
    if content_type in ALLOWED_TYPES_EXACT:
        return True
    # Check by extension for common development files that might have generic MIME types
    ext = os.path.splitext(filename.lower())[1]
    return ext in ALLOWED_EXTENSIONS


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
    original_filename = file.filename or "untitled"
    content_type = file.content_type or "application/octet-stream"
    if not _is_allowed_content_type(original_filename, content_type):
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type not allowed: {content_type} ({original_filename})",
        )

    # Read file content and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=http_status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 10MB.",
        )

    # Store file on disk
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


async def _resolve_user_from_token_or_header(
    request: Request,
    token: str | None,
    db: AsyncSession,
) -> User:
    raw = token
    if not raw:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            raw = auth[7:]
    if not raw:
        raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(raw, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError as exc:
        raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    result = await db.execute(select(User).where(User.id == int(sub)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@router.get("/api/v1/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    request: Request,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    current_user = await _resolve_user_from_token_or_header(request, token, db)
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

    # Project OWNER, task creator, or attachment uploader can delete
    is_owner = link.role == "OWNER"
    is_task_creator = task.creator_id == current_user.id
    is_uploader = attachment.user_id == current_user.id

    if not (is_owner or is_task_creator or is_uploader):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this attachment",
        )

    # Remove file from disk
    if os.path.exists(attachment.stored_path):
        os.remove(attachment.stored_path)

    await log_action(db, task.id, current_user.id, "attachment_removed", old_value=attachment.filename)

    await db.delete(attachment)
    await db.commit()
