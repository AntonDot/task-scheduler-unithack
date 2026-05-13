"""Web Push subscription management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.models.push_subscription import PushSubscription

router = APIRouter(prefix="/api/v1/push", tags=["push"])


class VapidKeyResponse(BaseModel):
    public_key: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: dict[str, str]


@router.get("/vapid-public-key", response_model=VapidKeyResponse)
async def get_vapid_public_key() -> VapidKeyResponse:
    """Return the server VAPID public key so the browser can subscribe."""
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications not configured on this server",
        )
    return VapidKeyResponse(public_key=settings.vapid_public_key)


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Save (or update) a push subscription for the authenticated user."""
    p256dh = body.keys.get("p256dh", "")
    auth = body.keys.get("auth", "")

    if not p256dh or not auth:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing keys.p256dh or keys.auth")

    # Upsert: remove any existing row with same endpoint, then insert fresh
    await db.execute(delete(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    db.add(PushSubscription(user_id=current_user.id, endpoint=body.endpoint, p256dh=p256dh, auth=auth))
    await db.commit()


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove all push subscriptions for the current user."""
    await db.execute(delete(PushSubscription).where(PushSubscription.user_id == current_user.id))
    await db.commit()
