"""Metrics in OpenMetrics/Prometheus format on a separate port (ML_METRICS_PORT).

Runtime (process_*, python_gc_*) comes with prometheus_client, framework metrics
(http_request_* per route) with prometheus-fastapi-instrumentator, business ones are below.
"""

from prometheus_client import Counter, Histogram, start_http_server

INCIDENTS = Counter(
    "taskscheduler_incidents",
    "Incident webhooks (negative reviews) by outcome: created, duplicate, error",
    ["result"],
)
LLM_REQUEST_DURATION = Histogram(
    "taskscheduler_llm_request_duration_seconds",
    "Time to turn free text into a task: mock or a real LLM call",
    ["mode"],
    buckets=(0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
)

# Known outcomes start at 0, so the series exist before the first incident
for _result in ("created", "duplicate", "error"):
    INCIDENTS.labels(result=_result)
for _mode in ("mock", "llm"):
    LLM_REQUEST_DURATION.labels(mode=_mode)


def start_metrics_server(port: int) -> None:
    start_http_server(port)
