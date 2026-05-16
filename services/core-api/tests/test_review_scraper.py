"""Tests for the review scraper service.

Verifies fetching from a mock review source, dedupe via webhook_deliveries,
and that review_received events are published to RabbitMQ.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Automation, WebhookDelivery
from app.services import review_scraper_service


@pytest.fixture
async def review_automation(session_factory, seed_data):
    async with session_factory() as session:
        a = Automation(
            project_id=seed_data["project"].id,
            creator_id=seed_data["manager"].id,
            name="Bad reviews → tasks",
            is_active=True,
            webhook_token="rev-tok",
            config={
                "trigger": {"type": "review_received", "params": {"source_url": "http://fake/api/reviews"}},
                "conditions": [],
                "actions": [{"type": "create_task", "params": {"title": "{{review.text}}"}}],
            },
        )
        session.add(a)
        await session.commit()
        await session.refresh(a)
        return a


FAKE_REVIEWS = [
    {"id": "r1", "rating": 1, "author": "Alice", "text": "Bad", "business": "Cafe", "date": "2026-01-01"},
    {"id": "r2", "rating": 2, "author": "Bob",   "text": "Meh", "business": "Cafe", "date": "2026-01-02"},
    {"id": "r3", "rating": 5, "author": "Eve",   "text": "Great", "business": "Cafe", "date": "2026-01-03"},
]


def _make_mock_httpx(reviews):
    """Build a fake httpx.AsyncClient context manager that returns the given reviews."""
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json = MagicMock(return_value={"reviews": reviews})

    client = AsyncMock()
    client.get = AsyncMock(return_value=resp)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    return client


@pytest.mark.asyncio
async def test_run_scrape_publishes_event_per_new_review(session_factory, review_automation):
    publish = AsyncMock()
    with patch("app.services.review_scraper_service.rabbitmq_manager.publish_event", publish), \
         patch("app.services.review_scraper_service.httpx.AsyncClient", return_value=_make_mock_httpx(FAKE_REVIEWS)):
        async with session_factory() as db:
            result = await review_scraper_service.run_scrape(db)

    assert result["automations_processed"] == 1
    assert result["events_published"] == 3
    assert publish.await_count == 3
    # Each call publishes review_received
    for call in publish.await_args_list:
        event_type, payload = call.args
        assert event_type == "review_received"
        assert "review" in payload
        assert payload["project_id"] == review_automation.project_id


@pytest.mark.asyncio
async def test_run_scrape_skips_already_delivered_reviews(session_factory, review_automation):
    """A review that already has a webhook_deliveries row must NOT republish."""
    # Pre-seed one delivery for r1 — simulates "we already saw this review"
    async with session_factory() as db:
        db.add(WebhookDelivery(
            automation_id=review_automation.id,
            external_event_id="review:r1",
        ))
        await db.commit()

    publish = AsyncMock()
    with patch("app.services.review_scraper_service.rabbitmq_manager.publish_event", publish), \
         patch("app.services.review_scraper_service.httpx.AsyncClient", return_value=_make_mock_httpx(FAKE_REVIEWS)):
        async with session_factory() as db:
            result = await review_scraper_service.run_scrape(db)

    # r1 was already delivered → only r2 and r3 should publish
    assert result["events_published"] == 2
    assert publish.await_count == 2
    published_event_ids = {call.args[1]["external_event_id"] for call in publish.await_args_list}
    assert "review:r1" not in published_event_ids
    assert "review:r2" in published_event_ids
    assert "review:r3" in published_event_ids


@pytest.mark.asyncio
async def test_run_scrape_no_review_automations(session_factory, seed_data):
    publish = AsyncMock()
    with patch("app.services.review_scraper_service.rabbitmq_manager.publish_event", publish):
        async with session_factory() as db:
            result = await review_scraper_service.run_scrape(db)
    assert result == {"automations_processed": 0, "reviews_seen": 0, "events_published": 0}
    publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_run_scrape_fetch_failure_is_safe(session_factory, review_automation):
    """If the source URL fails, scrape continues without crashing."""
    bad_client = AsyncMock()
    bad_client.get = AsyncMock(side_effect=RuntimeError("network"))
    bad_client.__aenter__ = AsyncMock(return_value=bad_client)
    bad_client.__aexit__ = AsyncMock(return_value=None)

    publish = AsyncMock()
    with patch("app.services.review_scraper_service.rabbitmq_manager.publish_event", publish), \
         patch("app.services.review_scraper_service.httpx.AsyncClient", return_value=bad_client):
        async with session_factory() as db:
            result = await review_scraper_service.run_scrape(db)
    assert result["events_published"] == 0
    publish.assert_not_awaited()
