"""Fault injection for SLO drills: makes core-api slow or failing on purpose.

Turned on from the environment (CORE_FAULT_ERROR_RATE, CORE_FAULT_LATENCY_MS,
CORE_FAULT_MEMORY_MB), off by default.
It touches only /api/ requests — users, the prober and other services see the degradation,
while /health and /ready keep answering, so Kubernetes does not take the pods out of rotation
and the failure stays visible in the SLIs instead of turning into a restart.

The middleware sits inside the metrics middleware: injected errors and delays are counted
in http_requests_total / http_request_duration_seconds like real ones.

CORE_FAULT_MEMORY_MB is a runtime fault: the process holds that much memory from startup,
as if it leaked, and process_resident_memory_bytes shows it (the alerting drill).
"""

import asyncio
import json
import random

from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import settings

_ballast: list[bytes] = []


def allocate_memory_ballast() -> None:
    """Hold CORE_FAULT_MEMORY_MB of memory until the process exits (no-op when 0)."""
    if settings.fault_memory_mb > 0:
        # Filled with ones, not zeros: every page is written, so it counts in the resident size
        _ballast.append(b"\x01" * (settings.fault_memory_mb * 1024 * 1024))


class FaultInjectionMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return

        # Read on every request: tests change settings on the fly
        if settings.fault_latency_ms > 0:
            await asyncio.sleep(settings.fault_latency_ms / 1000)
        if settings.fault_error_rate > 0 and random.random() < settings.fault_error_rate:  # noqa: S311
            body = json.dumps({"detail": "Injected fault (CORE_FAULT_ERROR_RATE)"}).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 503,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)
