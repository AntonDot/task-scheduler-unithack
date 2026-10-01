"""Review scraper — polls mock-review-board and sends negative reviews to ML Worker.

The scraper keeps no state of its own: every cycle it sends all negative reviews, and
ml-worker answers `duplicate` for those that already produced a task (the dedupe table
lives in core-api's PostgreSQL). So the process can be restarted, rescheduled or run
as a one-off `--once` job (e.g. a Kubernetes CronJob) without losing anything.
"""

import argparse
import asyncio
import contextlib
import json
import logging
import signal
import sys
from datetime import UTC, datetime

import httpx
from pydantic_settings import BaseSettings

from parser import filter_negative, parse_reviews


class Settings(BaseSettings):
    review_board_url: str
    ml_worker_url: str
    webhook_api_key: str
    interval_seconds: int = 60
    log_level: str = "INFO"

    model_config = {"env_prefix": "SCRAPER_", "extra": "ignore"}


class JsonFormatter(logging.Formatter):
    """One JSON object per line to stdout — the environment collects the stream."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "service": "review-scraper",
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


settings = Settings()
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter())
logging.basicConfig(level=settings.log_level.upper(), handlers=[_handler])
logger = logging.getLogger(__name__)

REVIEW_BOARD_URL = settings.review_board_url
ML_WORKER_URL = settings.ml_worker_url
WEBHOOK_API_KEY = settings.webhook_api_key

BUSINESS_SLUG_MAP = {
    "Онегин Парк": "onegin-park",
    "ЖК Берег": "zhk-bereg",
}


async def scrape_and_send() -> int:
    sent = 0

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{REVIEW_BOARD_URL}/reviews")
        resp.raise_for_status()
        html = resp.text

    reviews = parse_reviews(html)
    negative = filter_negative(reviews)

    async with httpx.AsyncClient(timeout=10) as client:
        for review in negative:
            slug = BUSINESS_SLUG_MAP.get(review["business"], "unknown")
            urgency = "URGENT" if review["rating"] <= 2 else "HIGH"
            payload = {
                "event_id": f"review-{review['id']}",
                "source": "mock-review-board",
                "text": review["text"],
                "urgency": urgency,
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
                if webhook_status == "created":
                    sent += 1
                    logger.info("Sent review %s (rating=%d) -> %s", review["id"], review["rating"], slug)
                else:
                    logger.debug("Review %s already processed", review["id"])
            except (httpx.HTTPError, RuntimeError, ValueError):
                logger.exception("Failed to send review %s", review["id"])

    return sent


async def run(interval: int | None = None):
    if interval is None:
        sent = await scrape_and_send()
        logger.info("Single run complete. Sent %d reviews.", sent)
        return

    # SIGTERM/SIGINT stop the loop between cycles instead of killing it mid-request
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    logger.info("Starting scraper loop with interval=%ds", interval)
    while not stop.is_set():
        try:
            sent = await scrape_and_send()
            logger.info("Cycle complete. Sent %d new reviews.", sent)
        except Exception:
            logger.exception("Error in scraper cycle")
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=interval)
    logger.info("Scraper stopped")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="Run once and exit")
    ap.add_argument("--interval", type=int, default=settings.interval_seconds, help="Poll interval in seconds")
    args = ap.parse_args()

    asyncio.run(run(interval=None if args.once else args.interval))
