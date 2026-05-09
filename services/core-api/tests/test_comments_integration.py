import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestCommentsIntegration:
    async def test_add_comment(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        token = get_token(seed_data["manager"].id)

        resp = await client.post(
            f"/api/v1/tasks/{tid}/comments",
            json={"text": "Integration test comment"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["text"] == "Integration test comment"
        assert data["task_id"] == tid
        assert data["user_id"] == seed_data["manager"].id
        assert "user" in data
        assert data["user"]["email"] == "manager@test.com"

    async def test_list_comments(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        token = get_token(seed_data["manager"].id)
        headers = {"Authorization": f"Bearer {token}"}

        await client.post(
            f"/api/v1/tasks/{tid}/comments",
            json={"text": "First comment"},
            headers=headers,
        )
        await client.post(
            f"/api/v1/tasks/{tid}/comments",
            json={"text": "Second comment"},
            headers=headers,
        )

        resp = await client.get(f"/api/v1/tasks/{tid}/comments", headers=headers)
        assert resp.status_code == 200
        comments = resp.json()
        assert len(comments) >= 2
        texts = [c["text"] for c in comments]
        assert "First comment" in texts
        assert "Second comment" in texts

    async def test_comment_empty_text_rejected(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        token = get_token(seed_data["manager"].id)

        resp = await client.post(
            f"/api/v1/tasks/{tid}/comments",
            json={"text": ""},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

    async def test_comment_requires_project_access(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        token = get_token(seed_data["outsider"].id)

        resp = await client.post(
            f"/api/v1/tasks/{tid}/comments",
            json={"text": "Outsider comment"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    async def test_comment_too_long_rejected(self, client: AsyncClient, seed_data, get_token):
        tid = seed_data["todo_task"].id
        token = get_token(seed_data["manager"].id)

        long_text = "x" * 2001
        resp = await client.post(
            f"/api/v1/tasks/{tid}/comments",
            json={"text": long_text},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

    async def test_comment_on_nonexistent_task(self, client: AsyncClient, seed_data, get_token):
        token = get_token(seed_data["manager"].id)

        resp = await client.post(
            "/api/v1/tasks/999999/comments",
            json={"text": "No task here"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    async def test_list_comments_on_nonexistent_task(self, client: AsyncClient, seed_data, get_token):
        token = get_token(seed_data["manager"].id)

        resp = await client.get(
            "/api/v1/tasks/999999/comments",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    async def test_comment_unauthenticated(self, client: AsyncClient, seed_data):
        tid = seed_data["todo_task"].id

        resp = await client.post(
            f"/api/v1/tasks/{tid}/comments",
            json={"text": "No auth"},
        )
        assert resp.status_code in (401, 403)
