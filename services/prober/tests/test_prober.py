import httpx
import pytest
import respx
from prometheus_client import REGISTRY

from main import Settings, probe_once

BASE = "http://web.test"


def _value(name: str, **labels) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


@pytest.fixture
def settings() -> Settings:
    return Settings()


def _healthy_app(mock: respx.MockRouter, *, projects=None, tasks_status: int = 200) -> None:
    # respx matches routes in the order they were added, so variations are passed in here
    mock.get("/").respond(200, text='<html><body><div id="root"></div></body></html>')
    mock.post("/api/v1/auth/token").respond(200, json={"access_token": "t", "token_type": "bearer"})
    mock.get("/api/v1/projects").respond(200, json=projects or [{"id": 7, "slug": "onegin-park", "name": "Онегин"}])
    mock.get("/api/v1/projects/7/columns").respond(200, json=[{"id": 1, "name": "Бэклог"}])
    mock.get("/api/v1/projects/7/tasks").respond(tasks_status, json=[])


async def _probe(settings: Settings) -> bool:
    async with httpx.AsyncClient(base_url=BASE) as client:
        return await probe_once(client, settings)


async def test_successful_journey(settings):
    before = _value("taskscheduler_probes_total", result="success")
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        _healthy_app(mock)
        assert await _probe(settings) is True
        login = mock.routes[1].calls.last.request
    assert b'"password":"secret"' in login.content
    assert _value("taskscheduler_probes_total", result="success") == before + 1
    assert _value("taskscheduler_probe_success") == 1


async def test_server_error_fails_at_its_step(settings):
    failures = _value("taskscheduler_probes_total", result="failure")
    tasks_step = _value("taskscheduler_probe_step_failures_total", step="tasks")
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        _healthy_app(mock, tasks_status=503)
        assert await _probe(settings) is False
    assert _value("taskscheduler_probes_total", result="failure") == failures + 1
    assert _value("taskscheduler_probe_step_failures_total", step="tasks") == tasks_step + 1
    assert _value("taskscheduler_probe_success") == 0


async def test_connection_error_is_a_failure(settings):
    page_step = _value("taskscheduler_probe_step_failures_total", step="page")
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        mock.get("/").mock(side_effect=httpx.ConnectError("refused"))
        assert await _probe(settings) is False
    assert _value("taskscheduler_probe_step_failures_total", step="page") == page_step + 1


async def test_missing_project_is_a_failure(settings):
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        _healthy_app(mock, projects=[{"id": 8, "slug": "zhk-bereg"}])
        assert await _probe(settings) is False


async def test_duration_is_observed_for_every_probe(settings):
    before = _value("taskscheduler_probe_duration_seconds_count")
    with respx.mock(base_url=BASE, assert_all_called=False) as mock:
        mock.get("/").respond(502)
        await _probe(settings)
    assert _value("taskscheduler_probe_duration_seconds_count") == before + 1


async def test_failure_series_exist_before_the_first_failure():
    for step in ("page", "login", "projects", "columns", "tasks"):
        assert REGISTRY.get_sample_value("taskscheduler_probe_step_failures_total", {"step": step}) is not None
