from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.services.incident_service import _processed_events

API_KEY = "dev-webhook-key"


@pytest.fixture(autouse=True)
def _set_api_key():
    original = settings.webhook_api_key
    settings.webhook_api_key = API_KEY
    yield
    settings.webhook_api_key = original


@pytest.fixture(autouse=True)
def _clear_processed():
    _processed_events.clear()


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
                    "event_id": "e1", "source": "yandex", "text": "Bad review",
                    "project_slug": "test", "external_rating": 1,
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
                    "event_id": "e2", "source": "analytics", "text": "Minor issue reported",
                    "project_slug": "test", "urgency": "LOW",
                },
                headers=_headers(),
            )
            assert resp.status_code == 200
            call_args = mock_create.call_args[0]
            assert call_args[1]["status"] == "AI_DRAFT"

    async def test_idempotency_duplicate_event(self, client):
        with patch("app.services.incident_service.core_api.create_task", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = {"id": 1}
            payload = {"event_id": "dup-1", "source": "test", "text": "test", "project_slug": "slug"}

            await client.post("/webhook/incident", json=payload, headers=_headers())
            resp = await client.post("/webhook/incident", json=payload, headers=_headers())

            assert resp.json()["status"] == "duplicate"
            assert mock_create.call_count == 1

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


class TestMockLLM:
    async def test_mock_llm_returns_valid_parsed_task(self):
        settings.use_mock_llm = True
        from app.clients.llm_client import parse_task
        result = await parse_task("We need to update the landing page for client Bereg")
        assert result.title
        assert result.description
        assert result.urgency in ("LOW", "MEDIUM", "HIGH", "URGENT")
