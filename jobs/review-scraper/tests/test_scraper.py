import json
from unittest.mock import patch

import httpx
import pytest
import respx

from scraper import (
    ML_WORKER_URL,
    REVIEW_BOARD_URL,
    load_processed_ids,
    save_processed_ids,
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


@pytest.fixture(autouse=True)
def _clean_state(tmp_path):
    state_file = tmp_path / "processed_ids.json"
    with patch("scraper.STATE_FILE", state_file):
        yield state_file


class TestStateFile:
    def test_load_empty(self, _clean_state):
        assert load_processed_ids() == set()

    def test_save_and_load(self, _clean_state):
        save_processed_ids({"rev-001", "rev-002"})
        loaded = load_processed_ids()
        assert loaded == {"rev-001", "rev-002"}

    def test_save_overwrites(self, _clean_state):
        save_processed_ids({"rev-001"})
        save_processed_ids({"rev-002", "rev-003"})
        assert load_processed_ids() == {"rev-002", "rev-003"}


class TestScrapeAndSend:
    @respx.mock
    async def test_sends_only_negative_reviews(self, _clean_state):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        sent = await scrape_and_send()

        assert sent == 2
        assert webhook_route.call_count == 2

    @respx.mock
    async def test_payload_matches_ml_worker_contract(self, _clean_state):
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
    async def test_correct_project_slug_mapping(self, _clean_state):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        await scrape_and_send()

        payloads = [json.loads(c.request.content) for c in webhook_route.calls]
        slugs = {p["project_slug"] for p in payloads}
        assert slugs == {"onegin-park", "zhk-bereg"}

    @respx.mock
    async def test_no_duplicates_on_repeated_runs(self, _clean_state):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        sent1 = await scrape_and_send()
        sent2 = await scrape_and_send()

        assert sent1 == 2
        assert sent2 == 0
        assert webhook_route.call_count == 2

    @respx.mock
    async def test_api_key_header_sent(self, _clean_state):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        webhook_route = respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "created", "task_id": 1})
        )

        await scrape_and_send()

        for call in webhook_route.calls:
            assert "X-API-Key" in call.request.headers

    @respx.mock
    async def test_failed_send_does_not_mark_processed(self, _clean_state):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(return_value=httpx.Response(500))

        sent = await scrape_and_send()

        assert sent == 0
        assert load_processed_ids() == set()

    @respx.mock
    async def test_error_status_in_200_response_not_marked_processed(self, _clean_state):
        respx.get(f"{REVIEW_BOARD_URL}/reviews").mock(return_value=httpx.Response(200, text=MOCK_HTML))
        respx.post(f"{ML_WORKER_URL}/webhook/incident").mock(
            return_value=httpx.Response(200, json={"status": "error", "message": "upstream failed"})
        )

        sent = await scrape_and_send()

        assert sent == 0
        assert load_processed_ids() == set()

    @respx.mock
    async def test_all_positive_reviews_sends_nothing(self, _clean_state):
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
