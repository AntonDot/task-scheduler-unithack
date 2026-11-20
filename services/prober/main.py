"""Prober — a synthetic user that keeps walking through the app and reports whether it could.

Every PROBER_INTERVAL_SECONDS it does what a person opening the board does, through the same
entry point (web: nginx + SPA, proxying /api to core-api):

    open the page → log in → list projects → open the board (columns + tasks)

A probe succeeds when every step answers 2xx with the expected content within the timeout.
Results are metrics on PROBER_METRICS_PORT, pulled by vmagent like any other pod:
the availability SLI is built from them (time-based: share of good minutes).

The prober only reads, so it does not create tasks or skew the business metrics.
"""

import asyncio
import contextlib
import json
import logging
import os
import signal
import sys
import time
from datetime import UTC, datetime

import httpx
from prometheus_client import Counter, Gauge, Histogram, start_http_server
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Where users come in: the web Service, not core-api directly
    target_url: str
    email: str
    password: str
    project_slug: str
    interval_seconds: float = 10.0
    timeout_seconds: float = 5.0
    metrics_port: int = 9100
    log_level: str = "INFO"

    model_config = {"env_prefix": "PROBER_", "extra": "ignore"}


APP_VERSION = os.environ.get("APP_VERSION", "dev")

STEPS = ("page", "login", "projects", "columns", "tasks")

PROBES = Counter("taskscheduler_probes", "Synthetic user journeys by result: success, failure", ["result"])
PROBE_STEP_FAILURES = Counter(
    "taskscheduler_probe_step_failures", "Failed probes by the step that failed first", ["step"]
)
PROBE_DURATION = Histogram(
    "taskscheduler_probe_duration_seconds",
    "Time of the whole journey, successful or not",
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)
PROBE_SUCCESS = Gauge("taskscheduler_probe_success", "1 if the last probe succeeded, else 0")
PROBE_LAST_TIMESTAMP = Gauge("taskscheduler_probe_last_timestamp_seconds", "Unix time the last probe finished")

# Series exist from the start: a failure counter that appears only with the first failure
# makes increase() blind to it
for _result in ("success", "failure"):
    PROBES.labels(result=_result)
for _step in STEPS:
    PROBE_STEP_FAILURES.labels(step=_step)


class JsonFormatter(logging.Formatter):
    """One JSON object per line to stdout, same schema as the other services."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "message": record.getMessage(),
            "service.name": "prober",
            "service.version": APP_VERSION,
            "logger": record.name,
        }
        if record.exc_info:
            entry["error.stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


logger = logging.getLogger("prober")


class ProbeError(Exception):
    def __init__(self, step: str, reason: str) -> None:
        super().__init__(f"{step}: {reason}")
        self.step = step


async def _call(client: httpx.AsyncClient, step: str, method: str, path: str, **kwargs) -> httpx.Response:
    try:
        resp = await client.request(method, path, **kwargs)
    except httpx.HTTPError as e:
        raise ProbeError(step, f"{type(e).__name__}: {e}") from e
    if not resp.is_success:
        raise ProbeError(step, f"HTTP {resp.status_code}")
    return resp


async def journey(client: httpx.AsyncClient, settings: Settings) -> None:
    """One walk through the app; raises ProbeError at the first step that went wrong."""
    page = await _call(client, "page", "GET", "/")
    if '<div id="root"' not in page.text:
        raise ProbeError("page", "SPA root element is missing")

    login = await _call(
        client, "login", "POST", "/api/v1/auth/token", json={"email": settings.email, "password": settings.password}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    projects = (await _call(client, "projects", "GET", "/api/v1/projects", headers=headers)).json()
    project = next((p for p in projects if p["slug"] == settings.project_slug), None)
    if project is None:
        raise ProbeError("projects", f"project {settings.project_slug!r} is not in the list")

    board = f"/api/v1/projects/{project['id']}"
    columns = (await _call(client, "columns", "GET", f"{board}/columns", headers=headers)).json()
    if not columns:
        raise ProbeError("columns", "board has no columns")
    await _call(client, "tasks", "GET", f"{board}/tasks", headers=headers)


async def probe_once(client: httpx.AsyncClient, settings: Settings) -> bool:
    started = time.monotonic()
    try:
        await journey(client, settings)
    except ProbeError as e:
        ok = False
        PROBE_STEP_FAILURES.labels(step=e.step).inc()
        logger.warning("Probe failed at %s", e)
    except (KeyError, TypeError, ValueError) as e:
        # A 2xx with a body of the wrong shape is a failure too
        ok = False
        PROBE_STEP_FAILURES.labels(step="projects").inc()
        logger.warning("Probe failed: unexpected response: %r", e)
    else:
        ok = True
    duration = time.monotonic() - started

    PROBE_DURATION.observe(duration)
    PROBES.labels(result="success" if ok else "failure").inc()
    PROBE_SUCCESS.set(1 if ok else 0)
    PROBE_LAST_TIMESTAMP.set_to_current_time()
    if ok:
        logger.debug("Probe succeeded in %.3fs", duration)
    return ok


async def run(settings: Settings) -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    if settings.metrics_port:
        start_http_server(settings.metrics_port)
    logger.info("Prober started: %s every %.0fs", settings.target_url, settings.interval_seconds)

    async with httpx.AsyncClient(base_url=settings.target_url, timeout=settings.timeout_seconds) as client:
        while not stop.is_set():
            await probe_once(client, settings)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=settings.interval_seconds)
    logger.info("Prober stopped")


if __name__ == "__main__":
    _settings = Settings()
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(JsonFormatter())
    logging.basicConfig(level=_settings.log_level.upper(), handlers=[_handler])
    # A line per HTTP call every 10 s is noise; failures are logged by the prober itself
    logging.getLogger("httpx").setLevel(logging.WARNING)
    asyncio.run(run(_settings))
