"""Review scraper — polls mock-review-board and sends negative reviews to ML Worker."""

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path

import httpx

from parser import filter_negative, parse_reviews

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

REVIEW_BOARD_URL = os.getenv("SCRAPER_REVIEW_BOARD_URL", "http://localhost:8002")
ML_WORKER_URL = os.getenv("SCRAPER_ML_WORKER_URL", "http://localhost:8001")
WEBHOOK_API_KEY = os.getenv("SCRAPER_WEBHOOK_API_KEY", "dev-webhook-key")
STATE_FILE = Path(os.getenv("SCRAPER_STATE_FILE", str(Path(__file__).parent / "processed_ids.json")))

BUSINESS_SLUG_MAP = {
    "Онегин Парк": "onegin-park",
    "ЖК Берег": "zhk-bereg",
}


def load_processed_ids() -> set[str]:
    if STATE_FILE.exists():
        return set(json.loads(STATE_FILE.read_text()))
    return set()


def save_processed_ids(ids: set[str]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(sorted(ids)))


async def scrape_and_send() -> int:
    processed = load_processed_ids()
    sent = 0

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{REVIEW_BOARD_URL}/reviews")
        resp.raise_for_status()
        html = resp.text

    reviews = parse_reviews(html)
    negative = filter_negative(reviews)

    async with httpx.AsyncClient(timeout=10) as client:
        for review in negative:
            if review["id"] in processed:
                logger.debug("Skipping already processed review %s", review["id"])
                continue

            slug = BUSINESS_SLUG_MAP.get(review["business"], "unknown")
            payload = {
                "event_id": f"review-{review['id']}",
                "source": "mock-review-board",
                "text": review["text"],
                "urgency": "URGENT",
                "project_slug": slug,
                "external_rating": review["rating"],
            }

            try:
                resp = await client.post(
                    f"{ML_WORKER_URL}/webhook/incident",
                    json=payload,
                    headers={"X-API-Key": WEBHOOK_API_KEY},
                )
                resp.raise_for_status()
                body = resp.json()
                webhook_status = body.get("status")
                if webhook_status not in {"created", "duplicate"}:
                    raise RuntimeError(f"Unexpected webhook status: {webhook_status}")
                processed.add(review["id"])
                if webhook_status == "created":
                    sent += 1
                logger.info("Sent review %s (rating=%d) -> %s", review["id"], review["rating"], slug)
            except (httpx.HTTPError, RuntimeError, ValueError):
                logger.exception("Failed to send review %s", review["id"])

    save_processed_ids(processed)
    return sent


async def run(interval: int | None = None):
    if interval is None:
        sent = await scrape_and_send()
        logger.info("Single run complete. Sent %d reviews.", sent)
        return

    logger.info("Starting scraper loop with interval=%ds", interval)
    while True:
        try:
            sent = await scrape_and_send()
            logger.info("Cycle complete. Sent %d new reviews.", sent)
        except Exception:
            logger.exception("Error in scraper cycle")
        await asyncio.sleep(interval)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="Run once and exit")
    ap.add_argument("--interval", type=int, default=60, help="Poll interval in seconds")
    args = ap.parse_args()

    asyncio.run(run(interval=None if args.once else args.interval))
