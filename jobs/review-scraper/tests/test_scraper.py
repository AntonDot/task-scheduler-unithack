import json
from unittest.mock import patch

import httpx
import respx

from scraper import (
    BUSINESS_SLUG_MAP,
    ML_WORKER_URL,
    REVIEW_BOARD_URL,
    scrape_and_send,
)

MOCK_HTML = """
<html>
<body>
<div class="review" data-review-id="rev-001" data-rating="5">
    <p>Отличная работа!</p>
    <span class="business">Онегин Парк</span>
</div>
<div class="review" data-review-id="rev-002" data-rating="1">
    <p>Ужасный сервис.</p>
    <span class="business">Онегин Парк</span>
</div>
<div class="review" data-review-id="rev-003" data-rating="2">
    <p>Долгая доставка.</p>
    <span class="business">ЖК Берег</span>
</div>
</body>
</html>
"""


class TestScrapeAndSend:
    @respx.mock
    async def test_sends_only_negative_reviews(self):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        sent = await scrape_and_send()

        assert sent == 2
        assert webhook_route.call_count == 2

    @respx.mock
    async def test_payload_matches_ml_worker_contract(self):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        await scrape_and_send()

        for call in webhook_route.calls:
            payload = json.loads(call.request.content)
            assert "event_id" in payload
            assert "source" in payload
            assert "text" in payload
            assert "project_slug" in payload
            assert "external_rating" in payload
            assert payload["urgency"] == "URGENT"
            assert payload["source"] == "mock-review-board"

    @respx.mock
    async def test_correct_project_slug_mapping(self):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        await scrape_and_send()

        payloads = [json.loads(c.request.content) for c in webhook_route.calls]
        slugs = {p["project_slug"] for p in payloads}
        assert slugs == {"onegin-park", "zhk-bereg"}

    @respx.mock
    async def test_repeated_runs_rely_on_server_side_dedupe(self):
        """The scraper is stateless: it resends reviews and ml-worker answers `duplicate`."""
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            side_effect=[
                httpx.Response(200, json={"status": "created", "task_id": 1}),
                httpx.Response(200, json={"status": "created", "task_id": 2}),
                httpx.Response(200, json={"status": "duplicate"}),
                httpx.Response(200, json={"status": "duplicate"}),
            ]
        )

        sent1 = await scrape_and_send()
        sent2 = await scrape_and_send()

        assert sent1 == 2
        assert sent2 == 0
        assert webhook_route.call_count == 4

    @respx.mock
    async def test_api_key_header_sent(self):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        await scrape_and_send()

        for call in webhook_route.calls:
            assert "X-API-Key" in call.request.headers

    @respx.mock
    async def test_failed_send_is_not_counted(self):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(return_value=httpx.Response(500))

        sent = await scrape_and_send()

        assert sent == 0

    @respx.mock
    async def test_error_status_in_200_response_is_not_counted(self):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "error", "message": "upstream failed"})
        )

        sent = await scrape_and_send()

        assert sent == 0

    @respx.mock
    async def test_all_positive_reviews_sends_nothing(self):
        positive_html = """
        <div class="review" data-review-id="r1" data-rating="5">
            <p>Great!</p><span class="business">Test</span>
        </div>
        """
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=positive_html))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident")

        sent = await scrape_and_send()

        assert sent == 0
        assert not webhook_route.called


class TestUrgencyMapping:
    @respx.mock
    async def test_urgency_based_on_rating(self):
        """Rating 1 and 2 → URGENT; rating 3 → HIGH (when included via max_rating=3)."""
        html = """
        <div class="review" data-review-id="r1" data-rating="1">
            <p>Terrible!</p><span class="business">Онегин Парк</span>
        </div>
        <div class="review" data-review-id="r2" data-rating="2">
            <p>Bad.</p><span class="business">Онегин Парк</span>
        </div>
        <div class="review" data-review-id="r3" data-rating="3">
            <p>Meh.</p><span class="business">Онегин Парк</span>
        </div>
        """
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=html))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        # Override filter_negative to include rating 3
        def _include_rating_3(reviews, **kw):
            return [r for r in reviews if r["rating"] <= 3]

        with patch("scraper.filter_negative", side_effect=_include_rating_3):
            await scrape_and_send()

        payloads = [json.loads(c.request.content) for c in webhook_route.calls]
        urgency_by_rating = {p["external_rating"]: p["urgency"] for p in payloads}
        assert urgency_by_rating[1] == "URGENT"
        assert urgency_by_rating[2] == "URGENT"
        assert urgency_by_rating[3] == "HIGH"


class TestBusinessSlugMapping:
    def test_unknown_business_maps_to_unknown_slug(self):
        """A business not in BUSINESS_SLUG_MAP should resolve to 'unknown'."""
        assert BUSINESS_SLUG_MAP.get("Несуществующий Бизнес", "unknown") == "unknown"

    @respx.mock
    async def test_unknown_business_slug_in_payload(self):
        """Review with unknown business sends project_slug='unknown'."""
        html = """
        <div class="review" data-review-id="r1" data-rating="1">
            <p>Bad!</p><span class="business">Unknown Corp</span>
        </div>
        """
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=html))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        await scrape_and_send()

        payload = json.loads(webhook_route.calls[0].request.content)
        assert payload["project_slug"] == "unknown"


class TestStatelessness:
    def test_no_local_state_file(self):
        """Nothing is written next to the process: no processed_ids.json, no STATE_FILE setting."""
        import scraper

        assert not hasattr(scraper, "STATE_FILE")
