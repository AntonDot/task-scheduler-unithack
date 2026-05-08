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
class TestProjectMembers:
    async def test_list_project_members(self, client, seed_data, get_token):
        pid = seed_data["project"].id
        resp = await client.get(
            f"/api/v1/projects/{pid}/members",
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        members = resp.json()
        assert len(members) == 2
        emails = {m["email"] for m in members}
        assert "manager@test.com" in emails
        assert "spec@test.com" in emails

    async def test_outsider_cannot_list_members(self, client, seed_data, get_token):
        pid = seed_data["project"].id
        resp = await client.get(
            f"/api/v1/projects/{pid}/members",
            headers={"Authorization": f"Bearer {get_token(seed_data['outsider'].id)}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
class TestAuth:
    async def test_create_token_success(self, client, seed_data):
        resp = await client.post(
            "/api/v1/auth/token",
            json={"email": "manager@test.com"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"  # noqa: S105

    async def test_create_token_invalid_email_404(self, client, seed_data):
        resp = await client.post(
            "/api/v1/auth/token",
            json={"email": "nonexistent@test.com"},
        )
        assert resp.status_code == 404


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

    async def test_get_single_task_not_found(self, client, seed_data, get_token):
        resp = await client.get(
            "/api/v1/tasks/99999",
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 404

    async def test_get_task_unauthorized(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.get(
            f"/api/v1/tasks/{tid}",
            headers={"Authorization": f"Bearer {get_token(seed_data['outsider'].id)}"},
        )
        assert resp.status_code == 403

    async def test_create_task(self, client, seed_data, get_token):
        pid = seed_data["project"].id
        resp = await client.post(
            f"/api/v1/projects/{pid}/tasks",
            json={"title": "New task", "urgency": "LOW"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == "New task"

    async def test_update_task_title(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}",
            json={"title": "Updated title"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated title"

    async def test_update_task_assignee_by_owner(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        new_assignee_id = seed_data["manager"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}",
            json={"assignee_id": new_assignee_id},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["assignee_id"] == new_assignee_id

    async def test_assignee_cannot_reassign(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}",
            json={"assignee_id": seed_data["manager"].id},
            headers={"Authorization": f"Bearer {get_token(seed_data['specialist'].id)}"},
        )
        assert resp.status_code == 403

    async def test_list_tasks_with_assignee_filter(self, client, seed_data, get_token):
        pid = seed_data["project"].id
        assignee_id = seed_data["specialist"].id
        resp = await client.get(
            f"/api/v1/projects/{pid}/tasks",
            params={"assignee_id": assignee_id},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        tasks = resp.json()
        assert len(tasks) == 3
        for task in tasks:
            assert task["assignee_id"] == assignee_id


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

    async def test_invalid_status_transition_from_todo_to_done(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "DONE"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 422

    async def test_assignee_cannot_move_to_done(self, client, seed_data, get_token):
        tid = seed_data["review_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "DONE"},
            headers={"Authorization": f"Bearer {get_token(seed_data['specialist'].id)}"},
        )
        assert resp.status_code == 403


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

    async def test_discard_non_draft_returns_422(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.delete(
            f"/api/v1/tasks/{tid}",
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 422

    async def test_assignee_cannot_discard(self, client, seed_data, get_token):
        tid = seed_data["draft_task"].id
        resp = await client.delete(
            f"/api/v1/tasks/{tid}",
            headers={"Authorization": f"Bearer {get_token(seed_data['specialist'].id)}"},
        )
        assert resp.status_code == 403
