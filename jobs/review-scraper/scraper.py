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
import os
import signal
import sys
from datetime import UTC, datetime

import httpx
from prometheus_client import CollectorRegistry, Gauge, generate_latest
from pydantic_settings import BaseSettings

from parser import filter_negative, parse_reviews


class Settings(BaseSettings):
    review_board_url: str
    ml_worker_url: str
    webhook_api_key: str
    interval_seconds: int = 60
    log_level: str = "INFO"
    # Push model: a CronJob pod lives seconds, nothing would be there to scrape. After each run
    # the scraper POSTs its metrics to vmagent's import endpoint; empty URL turns pushing off.
    metrics_push_url: str = ""

    model_config = {"env_prefix": "SCRAPER_", "extra": "ignore"}


# Release id baked into the image (Dockerfile ARG/ENV APP_VERSION)
APP_VERSION = os.environ.get("APP_VERSION", "dev")


class JsonFormatter(logging.Formatter):
    """One JSON object per line to stdout — the environment collects the stream."""

    def format(self, record: logging.LogRecord) -> str:
        # Field names follow the common log schema (timestamp, level, message, service.name),
        # flat dotted keys so a log store indexes them as is
        entry = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "message": record.getMessage(),
            "service.name": "review-scraper",
            "service.version": APP_VERSION,
            "logger": record.name,
        }
        if record.exc_info:
            entry["error.stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


settings = Settings()
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter())
logging.basicConfig(level=settings.log_level.upper(), handlers=[_handler])
logger = logging.getLogger(__name__)

REVIEW_BOARD_URL = settings.review_board_url
ML_WORKER_URL = settings.ml_worker_url
WEBHOOK_API_KEY = settings.webhook_api_key

# Gauges describe the last run: a pushed counter from a process that starts from zero every
# minute would not add up. A separate registry keeps runtime metrics of the pod out of the push.
PUSH_REGISTRY = CollectorRegistry()
LAST_RUN_NEGATIVE = Gauge(
    "taskscheduler_review_scraper_last_run_negative_reviews",
    "Negative reviews found on the review board in the last run",
    registry=PUSH_REGISTRY,
)
LAST_RUN_CREATED = Gauge(
    "taskscheduler_review_scraper_last_run_created_tasks",
    "Reviews that became new tasks in the last run (the rest were duplicates or failed)",
    registry=PUSH_REGISTRY,
)
LAST_RUN_FAILURES = Gauge(
    "taskscheduler_review_scraper_last_run_failures",
    "Reviews that could not be sent to ml-worker in the last run",
    registry=PUSH_REGISTRY,
)
LAST_RUN_SUCCESS = Gauge(
    "taskscheduler_review_scraper_last_run_success",
    "1 if the last run reached the review board and sent every review, else 0",
    registry=PUSH_REGISTRY,
)
LAST_RUN_TIMESTAMP = Gauge(
    "taskscheduler_review_scraper_last_run_timestamp_seconds",
    "Unix time the last run finished; time() minus it shows a stalled CronJob",
    registry=PUSH_REGISTRY,
)

BUSINESS_SLUG_MAP = {
    "Онегин Парк": "onegin-park",
    "ЖК Берег": "zhk-bereg",
}


async def scrape_and_send() -> int:
    sent = 0
    failed = 0

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{REVIEW_BOARD_URL}/reviews")
        resp.raise_for_status()
        html = resp.text

    reviews = parse_reviews(html)
    negative = filter_negative(reviews)
    LAST_RUN_NEGATIVE.set(len(negative))

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
                failed += 1
                logger.exception("Failed to send review %s", review["id"])

    LAST_RUN_CREATED.set(sent)
    LAST_RUN_FAILURES.set(failed)
    LAST_RUN_SUCCESS.set(1 if failed == 0 else 0)
    return sent


async def push_metrics() -> None:
    """Send the last-run gauges to vmagent (Prometheus text format, /api/v1/import/prometheus)."""
    if not settings.metrics_push_url:
        return
    LAST_RUN_TIMESTAMP.set_to_current_time()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                settings.metrics_push_url,
                content=generate_latest(PUSH_REGISTRY),
                params={"extra_label": "job=review-scraper"},
            )
            resp.raise_for_status()
    except httpx.HTTPError:
        # Monitoring must not fail the job itself
        logger.warning("Failed to push metrics to %s", settings.metrics_push_url, exc_info=True)


async def scrape_cycle() -> int:
    try:
        return await scrape_and_send()
    except Exception:
        # The review board itself is unreachable: nothing was sent
        LAST_RUN_SUCCESS.set(0)
        raise
    finally:
        await push_metrics()


async def run(interval: int | None = None):
    if interval is None:
        sent = await scrape_cycle()
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
            sent = await scrape_cycle()
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
