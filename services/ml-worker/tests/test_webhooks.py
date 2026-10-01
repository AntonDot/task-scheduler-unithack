from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app

API_KEY = "dev-webhook-key"


@pytest.fixture(autouse=True)
def _set_api_key():
    original = settings.webhook_api_key
    settings.webhook_api_key = API_KEY
    yield
    settings.webhook_api_key = original


@pytest.fixture(autouse=True)
def _event_processed():
    # Dedupe state lives in core-api; by default no event has been processed yet
    with patch("app.services.incident_service.core_api.event_processed", new_callable=AsyncMock) as mock:
        mock.return_value = False
        yield mock


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _headers():
    return {"X-API-Key": API_KEY}


class TestWebhookSecurity:
    async def test_missing_api_key(self, client):
        payload = {"event_id": "1", "source": "test", "text": "t", "project_slug": "s"}
        resp = await client.post("/webhook/incident", json=payload)
        assert resp.status_code == 422

    async def test_invalid_api_key(self, client):
        resp = await client.post(
            "/webhook/incident",
            json={"event_id": "1", "source": "test", "text": "test", "project_slug": "s"},
            headers={"X-API-Key": "wrong-key"},
        )
        assert resp.status_code == 401

    async def test_valid_api_key_passes(self, client):
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 1}
            resp = await client.post(
                "/webhook/incident",
                json={"event_id": "e1", "source": "test", "text": "test", "project_slug": "slug"},
                headers=_headers(),
            )
            assert resp.status_code == 200


class TestIncidentWebhook:
    async def test_critical_creates_todo(self, client):
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 1}
            resp = await client.post(
                "/webhook/incident",
                json={
                    "event_id": "e1",
                    "source": "yandex",
                    "text": "Bad review",
                    "project_slug": "test",
                    "external_rating": 1,
                },
                headers=_headers(),
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "created"
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "TODO"
            assert call_args[1]["urgency"] == "URGENT"

    async def test_non_critical_creates_ai_draft(self, client):
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 2}
            resp = await client.post(
                "/webhook/incident",
                json={
                    "event_id": "e2",
                    "source": "analytics",
                    "text": "Minor issue reported",
                    "project_slug": "test",
                    "urgency": "LOW",
                },
                headers=_headers(),
            )
            assert resp.status_code == 200
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "AI_DRAFT"

    async def test_idempotency_duplicate_event(self, client, _event_processed):
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 1}
            payload = {"event_id": "dup-1", "source": "test", "text": "test", "project_slug": "slug"}

            _event_processed.side_effect = [False, True]
            await client.post("/webhook/incident", json=payload, headers=_headers())
            resp = await client.post("/webhook/incident", json=payload, headers=_headers())

            assert resp.json()["status"] == "duplicate"
            assert mock_create.call_count == 1
            assert mock_create.call_args.kwargs["idempotency_key"] == "dup-1"

    async def test_concurrent_duplicate_rejected_by_core_api(self, client):
        from app.clients.core_api import DuplicateEventError

        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = DuplicateEventError("race-1")
            payload = {"event_id": "race-1", "source": "test", "text": "test", "project_slug": "slug"}
            resp = await client.post("/webhook/incident", json=payload, headers=_headers())
            assert resp.status_code == 200
            assert resp.json()["status"] == "duplicate"

    async def test_core_api_unavailable_on_dedupe_check_returns_502(self, client, _event_processed):
        _event_processed.side_effect = RuntimeError("core api down")
        payload = {"event_id": "down-1", "source": "test", "text": "test", "project_slug": "slug"}
        resp = await client.post("/webhook/incident", json=payload, headers=_headers())
        assert resp.status_code == 502

    async def test_invalid_payload_422(self, client):
        resp = await client.post(
            "/webhook/incident",
            json={"source": "test"},
            headers=_headers(),
        )
        assert resp.status_code == 422

    async def test_core_api_failure_returns_502(self, client):
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = RuntimeError("core api unavailable")
            resp = await client.post(
                "/webhook/incident",
                json={"event_id": "e3", "source": "test", "text": "fail", "project_slug": "slug"},
                headers=_headers(),
            )
            assert resp.status_code == 502


class TestDraftTextWebhook:
    async def test_creates_ai_draft(self, client):
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 3}
            resp = await client.post(
                "/webhook/draft-text",
                json={"source": "manager_ui", "text": "We need new banners for VK campaign", "project_slug": "test"},
                headers=_headers(),
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "created"
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "AI_DRAFT"

    async def test_invalid_source_422(self, client):
        resp = await client.post(
            "/webhook/draft-text",
            json={"source": "invalid_source", "text": "test", "project_slug": "test"},
            headers=_headers(),
        )
        assert resp.status_code == 422

    async def test_empty_text_422(self, client):
        resp = await client.post(
            "/webhook/draft-text",
            json={"source": "email", "text": "", "project_slug": "test"},
            headers=_headers(),
        )
        assert resp.status_code == 422


class TestIncidentRatings:
    async def test_rating_3_creates_ai_draft(self, client):
        """Rating 3 is NOT critical (threshold is <=2), so should create AI_DRAFT."""
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 10}
            resp = await client.post(
                "/webhook/incident",
                json={
                    "event_id": "rating3",
                    "source": "yandex",
                    "text": "Average service nothing special",
                    "project_slug": "test",
                    "external_rating": 3,
                },
                headers=_headers(),
            )
            assert resp.status_code == 200
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "AI_DRAFT"

    async def test_rating_2_creates_todo(self, client):
        """Rating 2 IS critical (<=2), so should create TODO with URGENT."""
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 11}
            resp = await client.post(
                "/webhook/incident",
                json={
                    "event_id": "rating2",
                    "source": "yandex",
                    "text": "Bad experience with support",
                    "project_slug": "test",
                    "external_rating": 2,
                },
                headers=_headers(),
            )
            assert resp.status_code == 200
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "TODO"
            assert call_args[1]["urgency"] == "URGENT"

    async def test_no_rating_creates_ai_draft(self, client):
        """No external_rating means not critical → AI_DRAFT."""
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 12}
            resp = await client.post(
                "/webhook/incident",
                json={
                    "event_id": "no-rating",
                    "source": "analytics",
                    "text": "Something happened in production",
                    "project_slug": "test",
                },
                headers=_headers(),
            )
            assert resp.status_code == 200
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "AI_DRAFT"

    async def test_urgent_without_rating_creates_ai_draft(self, client):
        """urgency=URGENT but no external_rating → AI_DRAFT because criticality checks only rating."""
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 13}
            resp = await client.post(
                "/webhook/incident",
                json={
                    "event_id": "urgent-no-rating",
                    "source": "monitoring",
                    "text": "Server is down immediately",
                    "project_slug": "test",
                    "urgency": "URGENT",
                },
                headers=_headers(),
            )
            assert resp.status_code == 200
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "AI_DRAFT"

    async def test_description_not_auto_format(self, client):
        """Verify description generated by LLM does not start with '[Auto]'."""
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 14}
            await client.post(
                "/webhook/incident",
                json={
                    "event_id": "desc-check",
                    "source": "test",
                    "text": "Some issue reported by user",
                    "project_slug": "test",
                },
                headers=_headers(),
            )
            call_args = mock_create.call_args[0]
            description = call_args[1]["description"]
            assert not description.startswith("[Auto]")


class TestDraftTextLLM:
    async def test_draft_text_uses_llm_parsed_title(self, client):
        """Verify title comes from LLM (mock), not the raw text."""
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 15}
            raw_text = "We need to update the landing page design for the autumn marketing campaign"
            await client.post(
                "/webhook/draft-text",
                json={"source": "manager_ui", "text": raw_text, "project_slug": "test"},
                headers=_headers(),
            )
            call_args = mock_create.call_args[0]
            title = call_args[1]["title"]
            # In mock mode, title is first 8 words of text (since len > 3)
            expected_title = " ".join(raw_text.split()[:8])
            assert title == expected_title
            # Title must NOT be the full raw text
            assert title != raw_text


class TestMockLLM:
    async def test_mock_llm_returns_valid_parsed_task(self):
        settings.use_mock_llm = True
        from app.clients.llm_client import parse_task

        result = await parse_task("We need to update the landing page for client Bereg")
        assert result.title
        assert result.description
        assert result.urgency in ("LOW", "MEDIUM", "HIGH", "URGENT")
