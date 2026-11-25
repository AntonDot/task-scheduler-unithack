"""The release that answered is visible in the response, the version endpoint and the metric."""

import pytest
from prometheus_client import REGISTRY

from app.version import APP_VERSION, POD_NAME


@pytest.mark.asyncio
class TestVersion:
    async def test_version_endpoint(self, client):
        resp = await client.get("/api/v1/version")
        assert resp.status_code == 200
        assert resp.json() == {"service": "core-api", "version": APP_VERSION, "pod": POD_NAME}

    async def test_every_response_has_version_header(self, client):
        for path in ("/health", "/api/v1/version", "/api/v1/projects"):  # the last one is 401
            resp = await client.get(path)
            assert resp.headers["X-App-Version"] == APP_VERSION

    async def test_health_reports_version(self, client):
        assert (await client.get("/health")).json()["version"] == APP_VERSION

    async def test_build_info_metric(self):
        assert REGISTRY.get_sample_value("taskscheduler_build_info", {"version": APP_VERSION}) == 1
