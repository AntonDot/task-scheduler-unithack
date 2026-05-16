"""Webhook ingress endpoint tests.

Covers: token lookup, dedupe via webhook_deliveries, GitHub HMAC validation,
GitHub event mapping, and the RabbitMQ publish call.
"""

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.models import Automation


@pytest.fixture
async def automation_with_webhook(session_factory, seed_data):
    """An active automation with webhook_token, ready to receive github_event posts."""
    async with session_factory() as session:
        automation = Automation(
            project_id=seed_data["project"].id,
            creator_id=seed_data["manager"].id,
            name="PR notifier",
            is_active=True,
            webhook_token="test-token-123",  # noqa: S106
            config={
                "trigger": {"type": "github_event", "params": {}},
                "conditions": [],
                "actions": [{"type": "send_notification", "params": {"message": "ok"}}],
            },
        )
        session.add(automation)
        await session.commit()
        await session.refresh(automation)
        return automation


@pytest.fixture
async def automation_with_secret(session_factory, seed_data):
    async with session_factory() as session:
        automation = Automation(
            project_id=seed_data["project"].id,
            creator_id=seed_data["manager"].id,
            name="Secured PR",
            is_active=True,
            webhook_token="secret-token-999",  # noqa: S106
            config={
                "trigger": {"type": "github_event", "params": {"secret": "supersecret"}},
                "conditions": [],
                "actions": [],
            },
        )
        session.add(automation)
        await session.commit()
        await session.refresh(automation)
        return automation


@pytest.fixture
async def automation_generic(session_factory, seed_data):
    async with session_factory() as session:
        automation = Automation(
            project_id=seed_data["project"].id,
            creator_id=seed_data["manager"].id,
            name="Generic ingress",
            is_active=True,
            webhook_token="generic-tok",  # noqa: S106
            config={
                "trigger": {"type": "webhook_generic", "params": {}},
                "conditions": [],
                "actions": [],
            },
        )
        session.add(automation)
        await session.commit()
        await session.refresh(automation)
        return automation


@pytest.mark.asyncio
async def test_unknown_token_returns_404(client):
    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", AsyncMock()):
        resp = await client.post("/api/v1/webhooks/does-not-exist", json={})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_disabled_automation_returns_410(client, session_factory, seed_data):
    async with session_factory() as session:
        a = Automation(
            project_id=seed_data["project"].id,
            name="Disabled",
            is_active=False,
            webhook_token="disabled-tok",  # noqa: S106
            config={"trigger": {"type": "webhook_generic"}},
        )
        session.add(a)
        await session.commit()

    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", AsyncMock()):
        resp = await client.post("/api/v1/webhooks/disabled-tok", json={})
    assert resp.status_code == 410


@pytest.mark.asyncio
async def test_github_pr_merged_publishes_event(client, automation_with_webhook):
    body = {
        "action": "closed",
        "pull_request": {
            "number": 42,
            "title": "Fix login",
            "merged": True,
            "html_url": "https://github.com/org/repo/pull/42",
            "user": {"login": "alice"},
            "merged_by": {"login": "bob"},
            "base": {"ref": "main"},
            "head": {"ref": "feature/login"},
        },
        "repository": {"full_name": "org/repo"},
        "sender": {"login": "bob"},
    }
    publish = AsyncMock()
    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", publish):
        resp = await client.post(
            "/api/v1/webhooks/test-token-123",
            json=body,
            headers={"X-GitHub-Event": "pull_request", "X-GitHub-Delivery": "delivery-1"},
        )
    assert resp.status_code == 202, resp.text
    assert resp.json()["event_type"] == "github_event"

    publish.assert_awaited_once()
    event_type, payload = publish.await_args.args
    assert event_type == "github_event"
    assert payload["github_event_type"] == "github_pr_merged"
    assert payload["pr"]["number"] == 42
    assert payload["pr"]["merged_by"] == "bob"
    assert payload["project_id"] == automation_with_webhook.project_id


@pytest.mark.asyncio
async def test_github_duplicate_delivery_dedupes(client, automation_with_webhook):
    body = {
        "action": "opened",
        "pull_request": {
            "number": 1,
            "title": "x",
            "user": {"login": "a"},
            "base": {"ref": "main"},
            "head": {"ref": "x"},
        },
    }
    publish = AsyncMock()
    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", publish):
        r1 = await client.post(
            "/api/v1/webhooks/test-token-123",
            json=body,
            headers={"X-GitHub-Event": "pull_request", "X-GitHub-Delivery": "same-delivery"},
        )
        r2 = await client.post(
            "/api/v1/webhooks/test-token-123",
            json=body,
            headers={"X-GitHub-Event": "pull_request", "X-GitHub-Delivery": "same-delivery"},
        )
    assert r1.status_code == 202
    assert r2.status_code == 200
    assert r2.json()["status"] == "duplicate"
    publish.assert_awaited_once()


@pytest.mark.asyncio
async def test_github_hmac_mismatch_returns_401(client, automation_with_secret):
    body = {
        "action": "opened",
        "pull_request": {"number": 1, "user": {"login": "a"}, "base": {"ref": "main"}, "head": {"ref": "x"}},
    }
    publish = AsyncMock()
    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", publish):
        resp = await client.post(
            "/api/v1/webhooks/secret-token-999",
            json=body,
            headers={
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "d-1",
                "X-Hub-Signature-256": "sha256=wrong",
            },
        )
    assert resp.status_code == 401
    publish.assert_not_awaited()


@pytest.mark.asyncio
async def test_github_hmac_valid_passes(client, automation_with_secret):
    body = {
        "action": "opened",
        "pull_request": {
            "number": 1,
            "title": "x",
            "user": {"login": "a"},
            "base": {"ref": "main"},
            "head": {"ref": "x"},
        },
        "repository": {"full_name": "o/r"},
    }
    raw = json.dumps(body).encode("utf-8")
    sig = "sha256=" + hmac.new(b"supersecret", raw, hashlib.sha256).hexdigest()
    publish = AsyncMock()
    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", publish):
        resp = await client.post(
            "/api/v1/webhooks/secret-token-999",
            content=raw,
            headers={
                "Content-Type": "application/json",
                "X-GitHub-Event": "pull_request",
                "X-GitHub-Delivery": "d-2",
                "X-Hub-Signature-256": sig,
            },
        )
    assert resp.status_code == 202
    publish.assert_awaited_once()


@pytest.mark.asyncio
async def test_generic_webhook_publishes_custom_event_type(client, automation_generic):
    body = {"event_type": "custom_thing", "external_event_id": "evt-99", "payload": {"foo": "bar"}}
    publish = AsyncMock()
    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", publish):
        resp = await client.post("/api/v1/webhooks/generic-tok", json=body)
    assert resp.status_code == 202
    publish.assert_awaited_once()
    event_type, payload = publish.await_args.args
    # webhook_generic always publishes as "webhook_generic"; custom type is in payload
    assert event_type == "webhook_generic"
    assert payload["webhook_event_type"] == "custom_thing"
    assert payload["foo"] == "bar"
    assert payload["external_event_id"] == "evt-99"


@pytest.mark.asyncio
async def test_github_ping_returns_pong(client, automation_with_webhook):
    publish = AsyncMock()
    with patch("app.api.v1.webhooks.rabbitmq_manager.publish_event", publish):
        resp = await client.post(
            "/api/v1/webhooks/test-token-123",
            json={"zen": "Anything added dilutes everything else."},
            headers={"X-GitHub-Event": "ping", "X-GitHub-Delivery": "ping-1"},
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pong"
    publish.assert_not_awaited()
