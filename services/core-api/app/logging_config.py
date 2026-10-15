"""Logs are an event stream: one line per event to stdout, no files.

Collecting, storing and routing them is the job of the environment (docker logs,
Kubernetes, a log shipper), not of the application. Each line is a JSON object so a
collector can parse it without regexps.
"""

import json
import logging
import os
import sys
from datetime import UTC, datetime

# Release id baked into the image (Dockerfile ARG/ENV APP_VERSION)
APP_VERSION = os.environ.get("APP_VERSION", "dev")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # Field names follow the common log schema (timestamp, level, message, service.name),
        # flat dotted keys so a log store indexes them as is
        entry = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "message": record.getMessage(),
            "service.name": "core-api",
            "service.version": APP_VERSION,
            "logger": record.name,
        }
        # uvicorn access records carry the request as args: (client, method, path, http_version, status)
        if record.name == "uvicorn.access" and isinstance(record.args, tuple) and len(record.args) == 5:
            client, method, path, _, status = record.args
            entry.update(
                {"http.method": method, "url.path": path, "http.status_code": status, "client.address": client}
            )
        if record.exc_info:
            entry["error.stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # uvicorn installs its own handlers; route its records through the root JSON handler
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True
