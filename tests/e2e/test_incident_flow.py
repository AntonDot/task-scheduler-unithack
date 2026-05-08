import time
import uuid

import pytest

from tests.e2e.conftest import CORE_API_URL, ML_WORKER_URL, REVIEW_BOARD_URL, WEBHOOK_API_KEY


def _wait_for_task(client, project_id, marker, headers, max_wait=10):
    for _ in range(max_wait * 2):
        resp = client.get(f"{CORE_API_URL}/api/v1/projects/{project_id}/tasks", headers=headers)
        resp.raise_for_status()
        for task in resp.json():
            if marker in (task.get("title") or "") or marker in (task.get("description") or ""):
                return task
        time.sleep(0.5)
    return None


@pytest.mark.e2e
class TestIncidentWebhookE2E:
    def test_critical_incident_creates_todo_task(self, client, owner_headers, bereg_project, live_services):
        if not live_services.get("ml"):
            pytest.skip("ML Worker not running")

        marker = f"E2E critical {uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{ML_WORKER_URL}/webhook/incident",
            headers={"X-API-Key": WEBHOOK_API_KEY},
            json={
                "event_id": f"e2e-{uuid.uuid4().hex}",
                "source": "e2e-suite",
                "text": marker,
                "urgency": "URGENT",
                "project_slug": "zhk-bereg",
                "external_rating": 1,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "created"

        task = _wait_for_task(client, bereg_project["id"], marker, owner_headers)
        assert task is not None, "Critical incident task not created"
        assert task["status"] == "TODO"
        assert task["urgency"] == "URGENT"
        assert "[Auto]" not in (task.get("description") or "")

    def test_non_critical_incident_creates_ai_draft(self, client, owner_headers, bereg_project, live_services):
        if not live_services.get("ml"):
            pytest.skip("ML Worker not running")

        marker = f"E2E non-critical {uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{ML_WORKER_URL}/webhook/incident",
            headers={"X-API-Key": WEBHOOK_API_KEY},
            json={
                "event_id": f"e2e-{uuid.uuid4().hex}",
                "source": "e2e-suite",
                "text": marker,
                "urgency": "HIGH",
                "project_slug": "zhk-bereg",
                "external_rating": 3,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "created"

        task = _wait_for_task(client, bereg_project["id"], marker, owner_headers)
        assert task is not None, "Non-critical incident task not created"
        assert task["status"] == "AI_DRAFT"

    def test_idempotency_prevents_duplicate(self, client, live_services):
        if not live_services.get("ml"):
            pytest.skip("ML Worker not running")

        event_id = f"e2e-dup-{uuid.uuid4().hex}"
        payload = {
            "event_id": event_id,
            "source": "e2e",
            "text": "Duplicate test",
            "project_slug": "zhk-bereg",
            "external_rating": 1,
        }

        resp1 = client.post(
            f"{ML_WORKER_URL}/webhook/incident",
            json=payload,
            headers={"X-API-Key": WEBHOOK_API_KEY},
        )
        assert resp1.json()["status"] == "created"

        resp2 = client.post(
            f"{ML_WORKER_URL}/webhook/incident",
            json=payload,
            headers={"X-API-Key": WEBHOOK_API_KEY},
        )
        assert resp2.json()["status"] == "duplicate"

    def test_invalid_api_key_rejected(self, client, live_services):
        if not live_services.get("ml"):
            pytest.skip("ML Worker not running")

        resp = client.post(
            f"{ML_WORKER_URL}/webhook/incident",
            json={"event_id": "x", "source": "x", "text": "x", "project_slug": "x"},
            headers={"X-API-Key": "invalid-key"},
        )
        assert resp.status_code == 401


@pytest.mark.e2e
class TestDraftTextWebhookE2E:
    def test_draft_text_creates_ai_draft(self, client, owner_headers, onegin_project, live_services):
        if not live_services.get("ml"):
            pytest.skip("ML Worker not running")

        marker = f"E2E draft {uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{ML_WORKER_URL}/webhook/draft-text",
            headers={"X-API-Key": WEBHOOK_API_KEY},
            json={
                "source": "manager_ui",
                "text": marker,
                "project_slug": "onegin-park",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "created"

        task = _wait_for_task(client, onegin_project["id"], marker, owner_headers)
        assert task is not None, "Draft text task not created"
        assert task["status"] == "AI_DRAFT"


@pytest.mark.e2e
class TestServiceTokenAuth:
    def test_service_token_creates_task(self, client, owner_headers, onegin_project):
        service_token = "dev-service-token"
        marker = f"E2E service {uuid.uuid4().hex[:8]}"
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/by-slug/onegin-park/tasks",
            json={"title": marker, "status": "TODO", "urgency": "URGENT"},
            headers={"Authorization": f"Bearer {service_token}"},
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == marker

    def test_invalid_service_token_rejected(self, client):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/by-slug/onegin-park/tasks",
            json={"title": "Should fail", "status": "TODO", "urgency": "LOW"},
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert resp.status_code == 401

    def test_service_token_with_invalid_slug_404(self, client):
        resp = client.post(
            f"{CORE_API_URL}/api/v1/projects/by-slug/nonexistent/tasks",
            json={"title": "Should 404", "status": "TODO", "urgency": "LOW"},
            headers={"Authorization": "Bearer dev-service-token"},
        )
        assert resp.status_code == 404


@pytest.mark.e2e
class TestReviewBoardE2E:
    def test_review_board_health(self, client, live_services):
        if not live_services.get("review"):
            pytest.skip("Review board not running")
        resp = client.get(f"{REVIEW_BOARD_URL}/health")
        assert resp.status_code == 200

    def test_generate_review(self, client, live_services):
        if not live_services.get("review"):
            pytest.skip("Review board not running")
        resp = client.post(f"{REVIEW_BOARD_URL}/api/reviews/generate")
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "rating" in data
        assert "text" in data

    def test_reviews_page_returns_html(self, client, live_services):
        if not live_services.get("review"):
            pytest.skip("Review board not running")
        resp = client.get(f"{REVIEW_BOARD_URL}/reviews")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
