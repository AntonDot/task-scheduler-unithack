"""Automation trigger endpoints — lets the frontend run server-side automation jobs."""
import logging
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.dependencies import get_current_user
from app.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/automations", tags=["automations"])

BUSINESS_SLUG_MAP = {
    "Онегин Парк": "onegin-park",
    "ЖК Берег": "zhk-bereg",
}


class ReviewScrapeResult(BaseModel):
    reviews_found: int
    negative_found: int
    tasks_created: int
    duplicates: int
    errors: int
    ran_at: str
    details: list[dict]


@router.post("/run-review-scraper", response_model=ReviewScrapeResult)
async def run_review_scraper(
    _user: User = Depends(get_current_user),
) -> ReviewScrapeResult:
    """Fetch negative reviews from the mock board and create tasks via ml-worker."""
    reviews: list[dict] = []
    tasks_created = 0
    duplicates = 0
    errors = 0
    details: list[dict] = []

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{settings.review_board_url}/api/reviews")
            resp.raise_for_status()
            data = resp.json()
            reviews = data.get("reviews", [])
        except Exception as exc:
            logger.error("Failed to fetch reviews: %s", exc)
            return ReviewScrapeResult(
                reviews_found=0, negative_found=0, tasks_created=0,
                duplicates=0, errors=1, ran_at=datetime.now(tz=UTC).isoformat(),
                details=[{"error": str(exc)}],
            )

        negative = [r for r in reviews if r.get("rating", 5) <= 2]

        for review in negative:
            slug = BUSINESS_SLUG_MAP.get(review.get("business", ""), "onegin-park")
            payload = {
                "event_id": f"review-{review['id']}",
                "source": "mock-review-board",
                "text": review["text"],
                "urgency": "URGENT",
                "project_slug": slug,
                "external_rating": review["rating"],
            }
            try:
                r = await client.post(
                    f"{settings.ml_worker_url}/webhook/incident",
                    json=payload,
                    headers={"X-API-Key": settings.ml_webhook_api_key},
                    timeout=15,
                )
                r.raise_for_status()
                body = r.json()
                status = body.get("status", "unknown")
                if status == "created":
                    tasks_created += 1
                    details.append({
                        "review_id": review["id"],
                        "author": review.get("author"),
                        "rating": review.get("rating"),
                        "task_id": body.get("task_id"),
                        "status": "created",
                    })
                elif status == "duplicate":
                    duplicates += 1
                    details.append({"review_id": review["id"], "status": "duplicate"})
                else:
                    errors += 1
                    details.append({"review_id": review["id"], "status": "error", "detail": status})
            except Exception as exc:
                errors += 1
                details.append({"review_id": review.get("id"), "status": "error", "detail": str(exc)})

    return ReviewScrapeResult(
        reviews_found=len(reviews),
        negative_found=len(negative),
        tasks_created=tasks_created,
        duplicates=duplicates,
        errors=errors,
        ran_at=datetime.now(tz=UTC).isoformat(),
        details=details,
    )
