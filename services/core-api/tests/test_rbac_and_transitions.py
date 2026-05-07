import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
class TestRBACAndTransitions:
    async def test_assignee_cannot_move_to_done(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["review_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "DONE"},
            headers={"Authorization": f"Bearer {get_token(seed_data['specialist'].id)}"},
        )
        assert resp.status_code == 403

    async def test_invalid_status_transition_returns_422(self, client: AsyncClient, seed_data, get_token):
        # AI_DRAFT -> IN_PROGRESS is invalid (must go to TODO first)
        tid = seed_data["draft_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "IN_PROGRESS"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 422

    async def test_owner_can_move_to_done(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["review_task"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "DONE"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "DONE"

    async def test_outsider_no_access_to_tasks(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.get(
            f"/api/v1/tasks/{tid}",
            headers={"Authorization": f"Bearer {get_token(seed_data['outsider'].id)}"},
        )
        assert resp.status_code == 403

    async def test_reopen_task_is_allowed(self, client: AsyncClient, seed_data, get_token, session_factory):
        # Move to DONE first (manually or via API)
        tid = seed_data["review_task"].id
        await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "DONE"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        
        # Now reopen
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/status",
            json={"status": "TODO"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "TODO"
