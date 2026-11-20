import time

import pytest
from prometheus_client import REGISTRY

from app.config import settings


def _requests(status: str) -> float:
    return (
        REGISTRY.get_sample_value(
            "http_requests_total", {"handler": "/api/v1/projects", "method": "GET", "status": status}
        )
        or 0.0
    )


@pytest.fixture
def faults():
    yield settings
    settings.fault_error_rate = 0.0
    settings.fault_latency_ms = 0


@pytest.mark.asyncio
class TestFaultInjection:
    async def test_off_by_default(self, client, seed_data, get_token):
        resp = await client.get(
            "/api/v1/projects", headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"}
        )
        assert resp.status_code == 200

    async def test_error_rate_answers_503_and_is_counted(self, client, seed_data, get_token, faults):
        faults.fault_error_rate = 1.0
        before = _requests("5xx")
        resp = await client.get(
            "/api/v1/projects", headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"}
        )
        assert resp.status_code == 503
        assert resp.json()["detail"].startswith("Injected fault")
        # Runs inside the metrics middleware: the SLI sees the injected error
        assert _requests("5xx") == before + 1

    async def test_probes_are_not_affected(self, client, faults):
        faults.fault_error_rate = 1.0
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_latency_is_added(self, client, seed_data, get_token, faults):
        faults.fault_latency_ms = 200
        started = time.monotonic()
        resp = await client.get(
            "/api/v1/projects", headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"}
        )
        assert resp.status_code == 200
        assert time.monotonic() - started >= 0.2
