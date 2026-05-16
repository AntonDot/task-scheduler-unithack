"""Pulls reviews from configured review boards and publishes events for new ones.

This is the manual-trigger replacement for the standalone `jobs/review-scraper`
script. It walks all active automations with `trigger.type == "review_received"`,
fetches reviews from each automation's configured source URL (default:
mock-review-board), dedupes via the same `webhook_deliveries` table the webhook
endpoint uses, and publishes a `review_received` event per new review.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Automation, WebhookDelivery
from app.rabbitmq import rabbitmq_manager

logger = logging.getLogger(__name__)
DEFAULT_REVIEWS_URL = "http://mock-review-board:8002/api/reviews"


async def _fetch_reviews(client: httpx.AsyncClient, url: str) -> list[dict[str, Any]]:
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("Failed to fetch reviews from %s: %s", url, e)
        return []

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        reviews = data.get("reviews")
        if isinstance(reviews, list):
            return reviews
    logger.warning("Unexpected reviews payload from %s: %r", url, type(data).__name__)
    return []


async def run_scrape(db: AsyncSession) -> dict[str, int]:
    """Iterate review-triggered automations, fetch & publish new reviews.

    Returns counters: { automations_processed, reviews_seen, events_published }.
    Idempotent via webhook_deliveries UNIQUE(automation_id, external_event_id).
    """
    result = await db.execute(
        select(Automation).where(Automation.is_active == True)  # noqa: E712
    )
    automations = [
        a for a in result.scalars().all() if ((a.config or {}).get("trigger") or {}).get("type") == "review_received"
    ]

    if not automations:
        return {"automations_processed": 0, "reviews_seen": 0, "events_published": 0}

    # Group by source_url so we fetch each board once
    by_source: dict[str, list[Automation]] = defaultdict(list)
    for a in automations:
        url = ((a.config["trigger"].get("params") or {}).get("source_url")) or DEFAULT_REVIEWS_URL
        by_source[url].append(a)

    automations_processed = 0
    reviews_seen = 0
    events_published = 0

    async with httpx.AsyncClient(timeout=10.0) as client:
        for url, autos in by_source.items():
            reviews = await _fetch_reviews(client, url)
            reviews_seen += len(reviews) * len(autos)  # counts per-automation

            for automation in autos:
                automations_processed += 1
                for review in reviews:
                    review_id = review.get("id") if isinstance(review, dict) else None
                    if review_id is None:
                        continue
                    external_event_id = f"review:{review_id}"

                    # Check-then-insert: aiosqlite rollback after IntegrityError
                    # leaves the session in a state that breaks subsequent ops.
                    # The UNIQUE constraint still acts as defense-in-depth.
                    existing = await db.execute(
                        select(WebhookDelivery.id).where(
                            WebhookDelivery.automation_id == automation.id,
                            WebhookDelivery.external_event_id == external_event_id,
                        )
                    )
                    if existing.scalar() is not None:
                        continue

                    db.add(
                        WebhookDelivery(
                            automation_id=automation.id,
                            external_event_id=external_event_id,
                        )
                    )
                    try:
                        await db.commit()
                    except IntegrityError:
                        # Race: another worker inserted same row between our select
                        # and our insert. Safe to skip.
                        await db.rollback()
                        continue

                    payload = {
                        "project_id": automation.project_id,
                        "automation_id": str(automation.id),
                        "external_event_id": external_event_id,
                        "review": review,
                    }
                    await rabbitmq_manager.publish_event("review_received", payload)
                    events_published += 1
                    logger.info(
                        "review_received published: automation=%s review_id=%s",
                        automation.id,
                        review_id,
                    )

    return {
        "automations_processed": automations_processed,
        "reviews_seen": reviews_seen,
        "events_published": events_published,
    }
