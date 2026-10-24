import pytest
from prometheus_client import REGISTRY, generate_latest

from app.config import settings


def _value(name: str, **labels) -> float:
    # Counters are process-global and other tests bump them too: compare deltas
    return REGISTRY.get_sample_value(name, labels) or 0.0


@pytest.mark.asyncio
class TestBusinessMetrics:
    async def test_task_created_by_user(self, client, seed_data, get_token):
        before = _value("taskscheduler_tasks_created_total", source="user")
        resp = await client.post(
            f"/api/v1/projects/{seed_data['project'].id}/tasks",
            json={"title": "Counted task"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 201
        assert _value("taskscheduler_tasks_created_total", source="user") == before + 1

    async def test_external_event_accepted_then_duplicate(self, client, seed_data):
        headers = {"Authorization": f"Bearer {settings.service_token}", "Idempotency-Key": "review-metrics-1"}
        created = _value("taskscheduler_tasks_created_total", source="external")
        accepted = _value("taskscheduler_external_events_total", result="accepted")
        duplicate = _value("taskscheduler_external_events_total", result="duplicate")

        first = await client.post("/api/v1/projects/by-slug/test-proj/tasks", json={"title": "Review"}, headers=headers)
        again = await client.post("/api/v1/projects/by-slug/test-proj/tasks", json={"title": "Review"}, headers=headers)

        assert (first.status_code, again.status_code) == (201, 409)
        assert _value("taskscheduler_tasks_created_total", source="external") == created + 1
        assert _value("taskscheduler_external_events_total", result="accepted") == accepted + 1
        assert _value("taskscheduler_external_events_total", result="duplicate") == duplicate + 1

    async def test_move_into_last_column_counts_as_completed(self, client, seed_data, get_token):
        pid = str(seed_data["project"].id)
        moves = _value("taskscheduler_task_moves_total", project_id=pid)
        completed = _value("taskscheduler_tasks_completed_total", project_id=pid)
        headers = {"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"}
        tid = seed_data["todo_task"].id

        # REVIEW (order 1) is the last column of the seeded board, TODO (order 0) is not
        await client.patch(
            f"/api/v1/tasks/{tid}/column", json={"column_id": seed_data["review_col"].id}, headers=headers
        )
        await client.patch(f"/api/v1/tasks/{tid}/column", json={"column_id": seed_data["todo_col"].id}, headers=headers)

        assert _value("taskscheduler_task_moves_total", project_id=pid) == moves + 2
        assert _value("taskscheduler_tasks_completed_total", project_id=pid) == completed + 1

    async def test_logins_by_result(self, client, seed_data):
        ok = _value("taskscheduler_logins_total", result="success")
        unknown = _value("taskscheduler_logins_total", result="unknown_user")

        await client.post("/api/v1/auth/token", json={"email": "manager@test.com"})
        await client.post("/api/v1/auth/token", json={"email": "nobody@test.com"})

        assert _value("taskscheduler_logins_total", result="success") == ok + 1
        assert _value("taskscheduler_logins_total", result="unknown_user") == unknown + 1

    async def test_comment_created(self, client, seed_data, get_token):
        before = _value("taskscheduler_comments_created_total")
        resp = await client.post(
            f"/api/v1/tasks/{seed_data['todo_task'].id}/comments",
            json={"text": "counted"},
            headers={"Authorization": f"Bearer {get_token(seed_data['manager'].id)}"},
        )
        assert resp.status_code == 201
        assert _value("taskscheduler_comments_created_total") == before + 1


@pytest.mark.asyncio
class TestMetricsExposure:
    async def test_registry_has_runtime_framework_and_business_metrics(self, client, seed_data):
        await client.post("/api/v1/auth/token", json={"email": "manager@test.com"})
        text = generate_latest(REGISTRY).decode()
        assert "python_gc_objects_collected_total" in text  # runtime
        assert 'http_requests_total{handler="/api/v1/auth/token"' in text  # framework, per route
        assert "taskscheduler_logins_total" in text  # business

    async def test_metrics_are_not_served_on_the_api_port(self, client):
        # Unauthenticated metrics live on CORE_METRICS_PORT only, never behind the user-facing port
        resp = await client.get("/metrics")
        assert resp.status_code == 404
