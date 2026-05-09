import os

import httpx
import pytest

CORE_API_URL = os.getenv("E2E_CORE_API_URL", "http://localhost:8000")
ML_WORKER_URL = os.getenv("E2E_ML_WORKER_URL", "http://localhost:8001")
WEB_URL = os.getenv("E2E_WEB_URL", "http://localhost:3000")


@pytest.fixture(scope="module")
def http_client():
    with httpx.Client(timeout=5) as client:
        yield client


def _service_reachable(client, url):
    try:
        client.get(url, timeout=2)
        return True
    except httpx.HTTPError:
        return False


class TestSmoke:
    def test_core_api_health(self, http_client):
        if not _service_reachable(http_client, f"{CORE_API_URL}/health"):
            pytest.skip("Core API not reachable")
        resp = http_client.get(f"{CORE_API_URL}/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "core-api"

    def test_ml_worker_health(self, http_client):
        if not _service_reachable(http_client, f"{ML_WORKER_URL}/health"):
            pytest.skip("ML Worker not reachable")
        resp = http_client.get(f"{ML_WORKER_URL}/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "ml-worker"

    def test_web_frontend_loads(self, http_client):
        if not _service_reachable(http_client, WEB_URL):
            pytest.skip("Web frontend not reachable")
        resp = http_client.get(WEB_URL)
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
        assert "Victory Group" in resp.text

    def test_core_api_auth_mode(self, http_client):
        if not _service_reachable(http_client, f"{CORE_API_URL}/health"):
            pytest.skip("Core API not reachable")
        resp = http_client.get(f"{CORE_API_URL}/api/v1/auth/mode")
        assert resp.status_code == 200
        data = resp.json()
        assert "dev_login" in data
