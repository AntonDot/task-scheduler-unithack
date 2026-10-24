"""Metrics in OpenMetrics/Prometheus format, pulled by the monitoring system.

Three layers, all in the default prometheus_client registry:
- runtime: process_* (CPU, memory, open fds) and python_gc_* / python_info, registered
  by prometheus_client itself;
- framework: http_request_* per route, from prometheus-fastapi-instrumentator (main.py);
- business: what happens on the boards — defined below.

The registry is served on a separate port (CORE_METRICS_PORT), not on the API port:
it needs no auth, so it must not be reachable through the Service and nginx that face users.
Counters are per process; sum them over replicas in queries.
"""

from prometheus_client import Counter, Gauge, start_http_server

TASKS_CREATED = Counter(
    "taskscheduler_tasks_created",
    "Tasks created, by where they came from: user (board), external (ml-worker: reviews, AI drafts), automation",
    ["source"],
)
TASK_MOVES = Counter(
    "taskscheduler_task_moves",
    "Tasks moved between board columns (drag-and-drop)",
    ["project_id"],
)
TASKS_COMPLETED = Counter(
    "taskscheduler_tasks_completed",
    "Tasks moved into the last column of their board",
    ["project_id"],
)
LOGINS = Counter(
    "taskscheduler_logins",
    "Login attempts by result: success, unknown_user, bad_password",
    ["result"],
)
COMMENTS_CREATED = Counter(
    "taskscheduler_comments_created",
    "Comments added to tasks",
)
EXTERNAL_EVENTS = Counter(
    "taskscheduler_external_events",
    "External events (reviews) turned into tasks: accepted, or duplicate rejected by Idempotency-Key",
    ["result"],
)
WEBSOCKET_CONNECTIONS = Gauge(
    "taskscheduler_websocket_connections",
    "Open WebSocket connections to the board of this replica",
)


def start_metrics_server(port: int) -> None:
    """Serve /metrics on its own port in a background thread."""
    start_http_server(port)


def _init_label_values() -> None:
    # A labeled series appears only after its first increment; known label values start at 0
    # so rate() and alerts see "nothing happened" instead of "no data"
    for source in ("user", "external", "automation"):
        TASKS_CREATED.labels(source=source)
    for result in ("success", "unknown_user", "bad_password"):
        LOGINS.labels(result=result)
    for result in ("accepted", "duplicate"):
        EXTERNAL_EVENTS.labels(result=result)


_init_label_values()
