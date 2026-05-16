from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_owner, require_project_access
from app.models import BoardColumn, Task, UserProject
from app.schemas.board_column import BoardColumnCreate, BoardColumnRead, BoardColumnReorder, BoardColumnUpdate
from app.websocket_manager import ws_manager

router = APIRouter(prefix="/api/v1", tags=["columns"])


@router.get("/projects/{project_id}/columns", response_model=list[BoardColumnRead])
async def list_columns(
    project_id: int,
    _access: UserProject = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BoardColumn).where(BoardColumn.project_id == project_id).order_by(BoardColumn.order, BoardColumn.id)
    )
    return result.scalars().all()


@router.post("/projects/{project_id}/columns", response_model=BoardColumnRead, status_code=201)
async def create_column(
    project_id: int,
    body: BoardColumnCreate,
    _access: UserProject = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    # Find the max order if order is not provided
    order = body.order
    if order is None:
        result = await db.execute(
            select(BoardColumn.order)
            .where(BoardColumn.project_id == project_id)
            .order_by(BoardColumn.order.desc())
            .limit(1)
        )
        max_order = result.scalar_one_or_none()
        order = (max_order + 1) if max_order is not None else 0

    column = BoardColumn(
        project_id=project_id,
        name=body.name,
        color=body.color,
        order=order,
    )
    db.add(column)
    await db.commit()
    await db.refresh(column)

    data = BoardColumnRead.model_validate(column).model_dump(mode="json")
    await ws_manager.broadcast(project_id, "columns_updated", {})
    return data


@router.put("/projects/{project_id}/columns/reorder")
async def reorder_columns(
    project_id: int,
    body: BoardColumnReorder,
    _access: UserProject = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BoardColumn).where(BoardColumn.project_id == project_id))
    columns = {col.id: col for col in result.scalars().all()}

    # Validate all ids belong to project
    for col_id in body.column_ids:
        if col_id not in columns:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST, detail=f"Column {col_id} not found in this project"
            )

    # Update order
    for idx, col_id in enumerate(body.column_ids):
        columns[col_id].order = idx

    await db.commit()
    await ws_manager.broadcast(project_id, "columns_updated", {})
    return {"status": "ok"}


@router.put("/projects/{project_id}/columns/{column_id}", response_model=BoardColumnRead)
async def update_column(
    project_id: int,
    column_id: int,
    body: BoardColumnUpdate,
    _access: UserProject = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BoardColumn).where(BoardColumn.id == column_id, BoardColumn.project_id == project_id)
    )
    column = result.scalar_one_or_none()
    if not column:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Column not found")

    if body.name is not None:
        column.name = body.name
    if body.color is not None:
        column.color = body.color

    await db.commit()
    await db.refresh(column)

    data = BoardColumnRead.model_validate(column).model_dump(mode="json")
    await ws_manager.broadcast(project_id, "columns_updated", {})
    return data


@router.delete("/projects/{project_id}/columns/{column_id}", status_code=204)
async def delete_column(
    project_id: int,
    column_id: int,
    _access: UserProject = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    # Get all columns for this project to check if it's the last one
    result = await db.execute(
        select(BoardColumn).where(BoardColumn.project_id == project_id).order_by(BoardColumn.order, BoardColumn.id)
    )
    columns = result.scalars().all()

    if len(columns) <= 1:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Cannot delete the last column")

    target_col = next((c for c in columns if c.id == column_id), None)
    if not target_col:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Column not found")

    if target_col.is_protected:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Cannot delete a protected column")

    # Find fallback column (first one that is not the target)
    fallback_col = next((c for c in columns if c.id != column_id), None)

    # Move all non-deleted tasks from target to fallback
    await db.execute(
        Task.__table__.update()
        .where(Task.column_id == column_id, not Task.is_deleted)
        .values(column_id=fallback_col.id)
    )

    await db.delete(target_col)
    await db.commit()

    await ws_manager.broadcast(project_id, "columns_updated", {})
    return None
