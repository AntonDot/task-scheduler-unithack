import httpx

from app.config import settings


class DuplicateEventError(Exception):
    """core-api already created a task for this external event."""


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.core_api_token}"}


async def event_processed(event_id: str) -> bool:
    """Whether a task was already created for this event — the dedupe state lives in core-api's PostgreSQL."""
    async with httpx.AsyncClient(base_url=settings.core_api_url, timeout=10) as client:
        resp = await client.get(f"/api/v1/internal/external-events/{event_id}", headers=_headers())
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True


async def create_task(project_slug: str, task_data: dict, idempotency_key: str | None = None) -> dict:
    headers = _headers()
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    async with httpx.AsyncClient(base_url=settings.core_api_url, timeout=10) as client:
        resp = await client.post(
            f"/api/v1/projects/by-slug/{project_slug}/tasks",
            json=task_data,
            headers=headers,
        )
        if resp.status_code == 409:
            raise DuplicateEventError(idempotency_key)
        resp.raise_for_status()
        return resp.json()
