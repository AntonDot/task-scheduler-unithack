import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestRBACAndTransitions:
    async def test_assignee_cannot_move_unassigned_task(self, client: AsyncClient, seed_data, get_token):
        pid = seed_data["project"].id
        review_col_id = seed_data["review_col"].id
        # Create a task assigned to manager only
        resp_create = await client.post(
            f"/api/v1/projects/{pid}/tasks",
            json={"title": "Manager-only", "urgency": "LOW", "assignee_id": seed_data["manager"].id},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp_create.status_code == 201
        tid = resp_create.json()["id"]

        resp = await client.patch(
            f"/api/v1/tasks/{tid}/column",
            json={"column_id": review_col_id},
            headers={"Authorization": f"Bearer {get_token(seed_data['specialist'].id)}"},
        )
        assert resp.status_code == 403

    async def test_outsider_no_access_to_tasks(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        resp = await client.get(
            f"/api/v1/tasks/{tid}",
            headers={"Authorization": f"Bearer {get_token(seed_data['outsider'].id)}"},
        )
        assert resp.status_code == 403

    async def test_owner_can_move_to_any_column(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["review_task"].id
        todo_col_id = seed_data["todo_col"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/column",
            json={"column_id": todo_col_id},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["column_id"] == todo_col_id

    async def test_assignee_can_move_own_task(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        review_col_id = seed_data["review_col"].id
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/column",
            json={"column_id": review_col_id},
            headers={"Authorization": f"Bearer {get_token(seed_data['specialist'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["column_id"] == review_col_id

    async def test_column_move_back_is_allowed(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["review_task"].id
        todo_col_id = seed_data["todo_col"].id
        review_col_id = seed_data["review_col"].id

        # Move to TODO
        await client.patch(
            f"/api/v1/tasks/{tid}/column",
            json={"column_id": todo_col_id},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        # Move back to REVIEW
        resp = await client.patch(
            f"/api/v1/tasks/{tid}/column",
            json={"column_id": review_col_id},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 200
        assert resp.json()["column_id"] == review_col_id
