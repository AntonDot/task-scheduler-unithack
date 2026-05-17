"""Web Push notification service using pywebpush + VAPID."""

from __future__ import annotations

import asyncio
import json
import logging

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


def _send_one_blocking(subscription_info: dict, payload: str, private_key: str, claims: dict) -> str | None:
    """Send one push in a thread (pywebpush uses blocking requests).
    Returns the endpoint string if it should be deleted (410 Gone), else None.
    """
    try:
        from pywebpush import webpush  # noqa: PLC0415

        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=private_key,
            vapid_claims=claims,
        )
        return None
    except Exception as exc:  # noqa: BLE001
        err_str = str(exc)
        if "410" in err_str or "gone" in err_str.lower() or "404" in err_str:
            return subscription_info["endpoint"]  # expired — caller will delete
        logger.warning("Push send failed for endpoint %s: %s", subscription_info["endpoint"], exc)
        return None


async def send_push_to_user(
    db: AsyncSession,
    user_id: int,
    title: str,
    body: str,
    url: str = "/",
    notif_type: str | None = None,
) -> None:
    """Send a Web Push notification to every subscription registered by `user_id`.
    Respects user notification settings if notif_type is provided.
    """
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.debug("VAPID not configured — skipping push for user %d", user_id)
        return

    try:
        from pywebpush import webpush  # noqa: PLC0415, F401 — verify import works
    except ImportError:
        logger.warning("pywebpush not installed — push notifications disabled")
        return

    # Check notification settings
    from app.models.user import User

    res = await db.execute(sa.select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()
    if not user:
        return

    if notif_type and user.notification_settings and user.notification_settings.get(notif_type) is False:
        logger.debug("Notification type %s disabled for user %d — skipping", notif_type, user_id)
        return

    result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subs = list(result.scalars().all())
    if not subs:
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    claims = {"sub": f"mailto:{settings.vapid_claims_email}"}
    private_key = settings.vapid_private_key

    dead_endpoints: list[str] = []

    for sub in subs:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        # Run blocking I/O in a thread so we don't block the event loop
        dead = await asyncio.to_thread(_send_one_blocking, subscription_info, payload, private_key, claims)
        if dead:
            dead_endpoints.append(dead)

    # Remove expired subscriptions
    if dead_endpoints:
        await db.execute(sa.delete(PushSubscription).where(PushSubscription.endpoint.in_(dead_endpoints)))
        await db.commit()
