import httpx

from app.config import settings


async def create_task(project_slug: str, task_data: dict) -> dict:
    async with httpx.AsyncClient(base_url=settings.core_api_url, timeout=10) as client:
        resp = await client.post(
            f"/api/v1/projects/by-slug/{project_slug}/tasks",
            json=task_data,
            headers={
                "Authorization": f"Bearer {settings.core_api_token}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()
