from datetime import UTC, datetime, timedelta

import pytest

from app.domain import TaskStatus, Urgency
from app.models import Task


@pytest.mark.asyncio
class TestAnalyticsBasic:
    async def test_analytics_returns_correct_counts(self, client, seed_data, get_token):
        """Analytics should return the correct total task count."""
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_tasks"] == 3  # seed_data has 3 tasks

    async def test_analytics_by_status_breakdown(self, client, seed_data, get_token):
        """Analytics should return correct status breakdown."""
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        by_status = data["by_status"]
        # seed_data: AI_DRAFT=1, TODO=1, REVIEW=1
        assert by_status.get("AI_DRAFT", 0) == 1
        assert by_status.get("TODO", 0) == 1
        assert by_status.get("REVIEW", 0) == 1

    async def test_analytics_by_urgency_breakdown(self, client, seed_data, get_token):
        """Analytics should return correct urgency breakdown."""
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        by_urgency = data["by_urgency"]
        # seed_data: MEDIUM=1, HIGH=1, LOW=1
        assert by_urgency.get("MEDIUM", 0) == 1
        assert by_urgency.get("HIGH", 0) == 1
        assert by_urgency.get("LOW", 0) == 1


@pytest.mark.asyncio
class TestAnalyticsOverdue:
    async def test_analytics_overdue_count(self, client, seed_data, get_token, session_factory):
        """Tasks with past deadlines should be counted as overdue."""
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        specialist = seed_data["specialist"]
        token = get_token(manager.id)

        # Add tasks with past deadlines (not DONE status)
        async with session_factory() as session:  # type: AsyncSession
            overdue1 = Task(
                project_id=pid,
                creator_id=manager.id,
                assignee_id=specialist.id,
                title="Overdue Task 1",
                status=TaskStatus.TODO,
                urgency=Urgency.HIGH,
                deadline=datetime.now(UTC) - timedelta(days=5),
            )
            overdue2 = Task(
                project_id=pid,
                creator_id=manager.id,
                assignee_id=specialist.id,
                title="Overdue Task 2",
                status=TaskStatus.IN_PROGRESS,
                urgency=Urgency.URGENT,
                deadline=datetime.now(UTC) - timedelta(days=2),
            )
            # This task is DONE so should NOT be counted as overdue
            done_past = Task(
                project_id=pid,
                creator_id=manager.id,
                assignee_id=specialist.id,
                title="Done Past Deadline",
                status=TaskStatus.DONE,
                urgency=Urgency.MEDIUM,
                deadline=datetime.now(UTC) - timedelta(days=10),
            )
            session.add_all([overdue1, overdue2, done_past])
            await session.commit()

        resp = await client.get(
            f"/api/v1/projects/{pid}/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Only 2 tasks are overdue (not DONE)
        assert data["overdue_count"] == 2


@pytest.mark.asyncio
class TestAnalyticsAssigneeLoad:
    async def test_analytics_assignee_load(self, client, seed_data, get_token):
        """Assignee load should show per-assignee task counts."""
        pid = seed_data["project"].id
        manager = seed_data["manager"]
        token = get_token(manager.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assignee_load = data["assignee_load"]
        assert isinstance(assignee_load, list)
        # All 3 seed tasks are assigned to the specialist
        specialist = seed_data["specialist"]
        spec_entry = [a for a in assignee_load if a["user_id"] == specialist.id]
        assert len(spec_entry) == 1
        assert spec_entry[0]["task_count"] == 3
        assert spec_entry[0]["full_name"] == "Specialist"


@pytest.mark.asyncio
class TestAnalyticsAccess:
    async def test_analytics_requires_project_access(self, client, seed_data, get_token):
        """Outsider should be denied access to analytics."""
        pid = seed_data["project"].id
        outsider = seed_data["outsider"]
        token = get_token(outsider.id)

        resp = await client.get(
            f"/api/v1/projects/{pid}/analytics",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
