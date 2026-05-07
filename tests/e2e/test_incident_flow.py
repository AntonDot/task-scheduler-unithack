import os
import time
import uuid

import httpx
import pytest

CORE_API_URL = os.getenv("E2E_CORE_API_URL", "http://localhost:8000")
ML_WORKER_URL = os.getenv("E2E_ML_WORKER_URL", "http://localhost:8001")
WEBHOOK_API_KEY = os.getenv("E2E_WEBHOOK_API_KEY", "dev-webhook-key")
DEMO_EMAIL = os.getenv("E2E_EMAIL", "d.morozov@victorygroup.ru")
TARGET_PROJECT_SLUG = os.getenv("E2E_PROJECT_SLUG", "zhk-bereg")


def _health_ok(client: httpx.Client, base_url: str) -> bool:
    try:
        resp = client.get(f"{base_url}/health", timeout=2)
        return resp.status_code == 200
    except httpx.HTTPError:
        return False


@pytest.mark.e2e
def test_incident_webhook_creates_task_in_core_api():
    with httpx.Client() as client:
        if not _health_ok(client, CORE_API_URL) or not _health_ok(client, ML_WORKER_URL):
            pytest.skip("E2E services are not running on localhost:8000/8001")

        token_resp = client.post(
            f"{CORE_API_URL}/api/v1/auth/token",
            json={"email": DEMO_EMAIL},
            timeout=5,
        )
        token_resp.raise_for_status()
        token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        projects_resp = client.get(f"{CORE_API_URL}/api/v1/projects", headers=headers, timeout=5)
        projects_resp.raise_for_status()
        projects = projects_resp.json()
        project = next((p for p in projects if p["slug"] == TARGET_PROJECT_SLUG), None)
        if project is None:
            pytest.skip(f"Project {TARGET_PROJECT_SLUG!r} not available for demo user")

        marker = f"E2E incident {uuid.uuid4().hex[:8]}"
        webhook_resp = client.post(
            f"{ML_WORKER_URL}/webhook/incident",
            headers={"X-API-Key": WEBHOOK_API_KEY},
            json={
                "event_id": f"e2e-{uuid.uuid4().hex}",
                "source": "e2e-suite",
                "text": marker,
                "urgency": "URGENT",
                "project_slug": TARGET_PROJECT_SLUG,
                "external_rating": 1,
            },
            timeout=5,
        )
        webhook_resp.raise_for_status()
        assert webhook_resp.json()["status"] == "created"

        created = False
        for _ in range(20):
            tasks_resp = client.get(
                f"{CORE_API_URL}/api/v1/projects/{project['id']}/tasks",
                headers=headers,
                timeout=5,
            )
            tasks_resp.raise_for_status()
            tasks = tasks_resp.json()
            if any(marker in task["title"] for task in tasks):
                created = True
                break
            time.sleep(0.5)

        assert created, "Webhook event was accepted, but task did not appear in project board"
