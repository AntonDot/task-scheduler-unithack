from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
class TestAuditLogOnTaskCreate:
    async def test_audit_log_created_on_task_create(self, client, seed_data, get_token):
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        with patch("app.api.v1.tasks.ws_manager.broadcast", new_callable=AsyncMock):
            resp = await client.post(
                f"/api/v1/projects/{pid}/tasks",
                json={"title": "Audited task", "urgency": "LOW"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        # Fetch audit logs for this task
        resp2 = await client.get(
            f"/api/v1/tasks/{task_id}/audit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 200
        logs = resp2.json()
        assert len(logs) >= 1
        created_log = [lg for lg in logs if lg["action"] == "created"]
        assert len(created_log) == 1
        assert created_log[0]["task_id"] == task_id
        assert created_log[0]["user_id"] == manager.id


@pytest.mark.asyncio
class TestAuditLogOnColumnChange:
    async def test_audit_log_on_column_change(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        specialist = seed_data["specialist"]
        manager = seed_data["manager"]
        token = get_token(specialist.id)
        manager_token = get_token(manager.id)
        review_col_id = seed_data["review_col"].id

        with patch("app.api.v1.tasks.ws_manager.broadcast", new_callable=AsyncMock):
            resp = await client.patch(
                f"/api/v1/tasks/{tid}/column",
                json={"column_id": review_col_id},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

        resp2 = await client.get(
            f"/api/v1/tasks/{tid}/audit",
            headers={"Authorization": f"Bearer {manager_token}"},
        )
        assert resp2.status_code == 200
        logs = resp2.json()
        column_logs = [lg for lg in logs if lg["action"] == "column_changed"]
        assert len(column_logs) >= 1
        log = column_logs[-1]
        assert log["old_value"] is not None
        assert log["new_value"] is not None


@pytest.mark.asyncio
class TestAuditLogOnTaskUpdate:
    async def test_audit_log_on_task_update(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        with patch("app.api.v1.tasks.ws_manager.broadcast", new_callable=AsyncMock):
            resp = await client.patch(
                f"/api/v1/tasks/{tid}",
                json={"title": "Updated for audit"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

        resp2 = await client.get(
            f"/api/v1/tasks/{tid}/audit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 200
        logs = resp2.json()
        update_logs = [lg for lg in logs if lg["action"] == "updated"]
        assert len(update_logs) >= 1


@pytest.mark.asyncio
class TestAuditLogOnTaskDelete:
    async def test_audit_log_on_task_delete(self, client, seed_data, get_token, session_factory):
        manager = seed_data["manager"]
        token = get_token(manager.id)
        tid = seed_data["todo_task"].id

        with patch("app.api.v1.tasks.ws_manager.broadcast", new_callable=AsyncMock):
            resp = await client.delete(
                f"/api/v1/tasks/{tid}",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 204

        # Audit logs for deleted tasks are stored (task_id still references the old id).
        # We query the audit_logs table directly since the task is deleted
        # and the audit endpoint requires task access.
        from sqlalchemy import select

        from app.models.audit_log import AuditLog

        async with session_factory() as session:  # type: AsyncSession
            result = await session.execute(select(AuditLog).where(AuditLog.task_id == tid))
            logs = result.scalars().all()
        deleted_logs = [lg for lg in logs if lg.action == "deleted"]
        assert len(deleted_logs) >= 1


@pytest.mark.asyncio
class TestGetAuditLogsAccess:
    async def test_get_audit_logs_requires_access(self, client, seed_data, get_token):
        """Outsider should not be able to view audit logs."""
        tid = seed_data["todo_task"].id
        outsider = seed_data["outsider"]
        token = get_token(outsider.id)

        resp = await client.get(
            f"/api/v1/tasks/{tid}/audit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403

    async def test_get_audit_logs_returns_entries(self, client, seed_data, get_token):
        """Members can view audit logs and get entries back after actions."""
        manager = seed_data["manager"]
        token = get_token(manager.id)
        pid = seed_data["project"].id

        # Create a task to generate an audit log
        with patch("app.api.v1.tasks.ws_manager.broadcast", new_callable=AsyncMock):
            resp = await client.post(
                f"/api/v1/projects/{pid}/tasks",
                json={"title": "Audit entry test", "urgency": "HIGH"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        resp2 = await client.get(
            f"/api/v1/tasks/{task_id}/audit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 200
        logs = resp2.json()
        assert len(logs) >= 1
        # Each entry should have the expected fields
        entry = logs[0]
        assert "id" in entry
        assert "task_id" in entry
        assert "user_id" in entry
        assert "action" in entry
        assert "created_at" in entry


@pytest.mark.asyncio
class TestAuditLogOnComment:
    async def test_audit_log_on_comment_added(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        with patch("app.api.v1.comments.ws_manager.broadcast", new_callable=AsyncMock):
            resp = await client.post(
                f"/api/v1/tasks/{tid}/comments",
                json={"text": "This is a test comment"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 201

        resp2 = await client.get(
            f"/api/v1/tasks/{tid}/audit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 200
        logs = resp2.json()
        comment_logs = [lg for lg in logs if lg["action"] == "comment_added"]
        assert len(comment_logs) >= 1


@pytest.mark.asyncio
class TestOutsiderCannotViewAudit:
    async def test_outsider_cannot_view_audit(self, client, seed_data, get_token):
        tid = seed_data["todo_task"].id
        outsider = seed_data["outsider"]
        token = get_token(outsider.id)

        resp = await client.get(
            f"/api/v1/tasks/{tid}/audit",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
