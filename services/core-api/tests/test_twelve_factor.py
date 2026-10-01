"""Behaviour that keeps core-api a 12-factor app: config only from the environment,
dedupe state in PostgreSQL instead of process memory, WebSocket fan-out between replicas."""

import json

import pytest
from pydantic import ValidationError

from app.config import Settings, settings
from app.websocket_manager import _MAX_PAYLOAD_BYTES, WebSocketManager


def _service_headers(**extra):
    return {"Authorization": f"Bearer {settings.service_token}", **extra}


class TestConfig:
    def test_secrets_and_backing_services_have_no_defaults(self, monkeypatch):
        for name in ("DATABASE_URL", "JWT_SECRET", "SERVICE_TOKEN", "ML_WEBHOOK_API_KEY", "S3_ACCESS_KEY"):
            monkeypatch.delenv(f"CORE_{name}", raising=False)
        with pytest.raises(ValidationError) as exc:
            Settings()
        missing = {err["loc"][0] for err in exc.value.errors()}
        assert {"database_url", "jwt_secret", "service_token", "ml_webhook_api_key", "s3_access_key"} <= missing

    def test_dev_login_is_off_unless_enabled(self, monkeypatch):
        monkeypatch.delenv("CORE_DEV_LOGIN", raising=False)
        assert Settings().dev_login is False


@pytest.mark.asyncio
class TestExternalEventDedupe:
    async def test_same_idempotency_key_creates_task_once(self, client, seed_data):
        body = {"title": "Review incident", "urgency": "URGENT"}
        first = await client.post(
            "/api/v1/projects/by-slug/test-proj/tasks",
            json=body,
            headers=_service_headers(**{"Idempotency-Key": "r-1"}),
        )
        second = await client.post(
            "/api/v1/projects/by-slug/test-proj/tasks",
            json=body,
            headers=_service_headers(**{"Idempotency-Key": "r-1"}),
        )
        assert first.status_code == 201
        assert second.status_code == 409

        event = await client.get("/api/v1/internal/external-events/r-1", headers=_service_headers())
        assert event.status_code == 200
        assert event.json() == {"event_id": "r-1", "task_id": first.json()["id"]}

    async def test_unknown_event_is_404(self, client, seed_data):
        resp = await client.get("/api/v1/internal/external-events/nope", headers=_service_headers())
        assert resp.status_code == 404

    async def test_event_lookup_requires_service_token(self, client, seed_data):
        resp = await client.get("/api/v1/internal/external-events/r-1", headers={"Authorization": "Bearer wrong"})
        assert resp.status_code == 401


class _FakeSocket:
    def __init__(self):
        self.sent: list[str] = []

    async def send_text(self, message: str) -> None:
        self.sent.append(message)


class _FakePgConnection:
    def __init__(self):
        self.notified: list[tuple[str, str]] = []

    async def execute(self, _query: str, channel: str, payload: str) -> None:
        self.notified.append((channel, payload))


@pytest.mark.asyncio
class TestWebSocketFanOut:
    async def test_without_listener_delivers_locally(self):
        manager = WebSocketManager()
        ws = _FakeSocket()
        manager._connections[1].append(ws)
        await manager.broadcast(1, "task_created", {"id": 7, "title": "T"})
        assert json.loads(ws.sent[0]) == {"event": "task_created", "data": {"id": 7, "title": "T"}}

    async def test_with_listener_publishes_to_postgres_not_to_sockets(self):
        manager = WebSocketManager()
        ws = _FakeSocket()
        manager._connections[1].append(ws)
        manager._conn = conn = _FakePgConnection()
        manager._channel = "ws_events"

        await manager.broadcast(1, "task_created", {"id": 7, "title": "T"})

        assert ws.sent == []  # delivery happens when NOTIFY comes back, on every replica
        [(channel, payload)] = conn.notified
        assert channel == "ws_events"
        assert json.loads(payload) == {"project_id": 1, "event": "task_created", "data": {"id": 7, "title": "T"}}

    async def test_large_payload_is_trimmed_below_notify_limit(self):
        manager = WebSocketManager()
        manager._conn = conn = _FakePgConnection()
        manager._channel = "ws_events"

        await manager.broadcast(1, "task_updated", {"id": 7, "title": "T", "description": "x" * 20_000})

        [(_, payload)] = conn.notified
        assert len(payload.encode()) < _MAX_PAYLOAD_BYTES
        assert json.loads(payload)["data"] == {"id": 7, "title": "T"}

    async def test_hung_connection_is_replaced_and_event_delivered_locally(self, monkeypatch):
        import asyncio

        import app.websocket_manager as wsm

        class _HungConnection:
            terminated = False

            async def execute(self, *_args):
                await asyncio.sleep(3600)

            def remove_termination_listener(self, _cb):
                pass

            def terminate(self):
                self.terminated = True

        monkeypatch.setattr(wsm, "_NOTIFY_TIMEOUT_SECONDS", 0.01)
        manager = WebSocketManager()
        ws = _FakeSocket()
        manager._connections[1].append(ws)
        manager._conn = hung = _HungConnection()
        reconnects = []

        async def fake_reconnect():
            reconnects.append(1)

        monkeypatch.setattr(manager, "_reconnect", fake_reconnect)
        await manager.broadcast(1, "task_created", {"id": 1, "title": "T"})
        for task in list(manager._tasks):
            await task

        assert hung.terminated
        assert manager._conn is None
        assert reconnects == [1]
        assert json.loads(ws.sent[0])["event"] == "task_created"

    async def test_notification_is_delivered_to_local_sockets(self):
        manager = WebSocketManager()
        ws = _FakeSocket()
        manager._connections[3].append(ws)

        manager._on_notify(None, 0, "ws_events", json.dumps({"project_id": 3, "event": "task_deleted", "data": {}}))
        for task in list(manager._tasks):
            await task

        assert json.loads(ws.sent[0]) == {"event": "task_deleted", "data": {}}


@pytest.mark.asyncio
class TestIdempotencyRace:
    async def test_key_claimed_by_concurrent_request_gives_409_without_creating_task(
        self, client, seed_data, session_factory, monkeypatch
    ):
        from sqlalchemy import func, select
        from sqlalchemy.ext.asyncio import AsyncSession

        from app.models import ExternalEvent, Task

        async with session_factory() as s:
            s.add(ExternalEvent(event_id="race-1"))
            await s.commit()
            tasks_before = (await s.execute(select(func.count(Task.id)))).scalar()

        # Simulate losing the race: the early lookup does not see the other request's row yet
        original_get = AsyncSession.get

        async def get_without_events(self, entity, ident, **kw):
            if entity is ExternalEvent:
                return None
            return await original_get(self, entity, ident, **kw)

        monkeypatch.setattr(AsyncSession, "get", get_without_events)
        resp = await client.post(
            "/api/v1/projects/by-slug/test-proj/tasks",
            json={"title": "dup", "urgency": "LOW"},
            headers=_service_headers(**{"Idempotency-Key": "race-1"}),
        )
        assert resp.status_code == 409

        async with session_factory() as s:
            assert (await s.execute(select(func.count(Task.id)))).scalar() == tasks_before


@pytest.mark.asyncio
class TestRabbitMQRetry:
    async def test_unavailable_broker_is_retried_in_background(self, monkeypatch):
        import asyncio

        from app.rabbitmq import RabbitMQManager

        monkeypatch.setattr(settings, "rabbitmq_url", "amqp://rabbitmq.test/")
        attempts = []

        async def fake_connect(self):
            attempts.append(1)
            return len(attempts) >= 3

        monkeypatch.setattr(RabbitMQManager, "_connect", fake_connect)
        manager = RabbitMQManager()
        manager.retry_interval_seconds = 0
        await manager.start()
        await asyncio.wait_for(manager._retry_task, 1)
        assert len(attempts) == 3
        await manager.stop()
