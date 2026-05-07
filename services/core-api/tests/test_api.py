from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings


@pytest.mark.asyncio
class TestHealth:
    async def test_health(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["service"] == "core-api"


@pytest.mark.asyncio
class TestProjects:
    async def test_list_projects_authorized(self, client, seed_data, get_token):
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_list_projects_outsider_sees_none(self, client, seed_data, get_token):
        resp = await client.get(
            "/api/v1/projects",
            headers={"Authorization": f"Bearer {get_token(seed_data['outsider'].id)}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 0

    async def test_list_projects_unauthenticated(self, client):
        resp = await client.get("/api/v1/projects")
        assert resp.status_code in (401, 403)

    async def test_create_task_by_slug_with_service_token(self, client, seed_data):
        resp = await client.post(
            "/api/v1/projects/by-slug/test-proj/tasks",
            json={"title": "Webhook incident", "status": "TODO", "urgency": "URGENT"},
            headers={"Authorization": f"Bearer {settings.service_token}"},
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == "Webhook incident"

    async def test_create_task_by_slug_rejects_invalid_service_token(self, client):
        resp = await client.post(
            "/api/v1/projects/by-slug/test-proj/tasks",
            json={"title": "Webhook incident", "status": "TODO", "urgency": "URGENT"},
            headers={"Authorization": "Bearer wrong"},
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
class TestTasksCRUD:
    async def test_list_tasks(self, client, seed_data, get_token):
        pid = seed_data["project"].id
        resp = await client.get(
            f"/api/v1/projects/{pid}/tasks",
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    async def test_get_single_task(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.get(
            f"/api/v1/tasks/{tid}",
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == tid

    async def test_create_task(self, client, seed_data, get_token):
        pid = seed_data["project"].id
        resp = await client.post(
            f"/api/v1/projects/{pid}/tasks",
            json={"title": "New task", "urgency": "LOW"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == "New task"


@pytest.mark.asyncio
class TestStatusTransitions:
    async def test_valid_transition(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "IN_PROGRESS"},
            headers={"Authorization": f"Bearer {get_token(seed_data['specialist'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "IN_PROGRESS"


@pytest.mark.asyncio
class TestApprove:
    async def test_approve_by_owner(self, client, seed_data, get_token):
        tid = seed_data["draft_task"].id
        resp = await client.post(
            f"/api/v1/tasks/{tid}/approve",
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "TODO"


@pytest.mark.asyncio
class TestDiscard:
    async def test_owner_can_discard_ai_draft(self, client, seed_data, get_token):
        tid = seed_data["draft_task"].id
        with patch("app.api.v1.tasks.ws_manager.broadcast", new_callable=AsyncMock):
            resp = await client.delete(
                f"/api/v1/tasks/{tid}",
                headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
            )
            assert resp.status_code == 204
