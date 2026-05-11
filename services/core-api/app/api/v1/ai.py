"""AI writing assistant — proxies to ml-worker /ai/improve."""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


class ImproveRequest(BaseModel):
    text: str
    project_slug: str | None = None


class ImproveResponse(BaseModel):
    title: str
    description: str
    urgency: str


@router.post("/improve", response_model=ImproveResponse)
async def improve_text(
    body: ImproveRequest,
    _user: User = Depends(get_current_user),
) -> ImproveResponse:
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                f"{settings.ml_worker_url}/ai/improve",
                json=body.model_dump(),
            )
            resp.raise_for_status()
            return ImproveResponse(**resp.json())
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"AI service unavailable: {exc}") from exc
